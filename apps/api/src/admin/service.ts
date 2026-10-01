import type { AdminUser, Role } from '@ctws/contracts'
import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { LOCK_ADMIN_SET } from '../auth/service'
import type { Db } from '../db/client'
import { sessions, users } from '../db/schema'

export class UserNotFoundError extends Error {
  constructor() {
    super('user not found')
  }
}

export class LastAdminError extends Error {
  constructor() {
    super('at least one enabled admin must remain')
  }
}

// Explicit columns, never the whole row: the password hash must not be selectable from here.
const adminColumns = {
  id: users.id,
  email: users.email,
  role: users.role,
  disabledAt: users.disabledAt,
  createdAt: users.createdAt,
}

function toAdminUser(row: {
  id: string
  email: string
  role: string
  disabledAt: Date | null
  createdAt: Date
}): AdminUser {
  return {
    id: row.id,
    email: row.email,
    role: row.role as Role,
    disabledAt: row.disabledAt ? row.disabledAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  }
}

export async function listUsers(db: Db): Promise<AdminUser[]> {
  const rows = await db.select(adminColumns).from(users).orderBy(asc(users.createdAt))
  return rows.map(toAdminUser)
}

export async function getAdminUser(db: Db, id: string): Promise<AdminUser | null> {
  const rows = await db.select(adminColumns).from(users).where(eq(users.id, id)).limit(1)
  return rows[0] ? toAdminUser(rows[0]) : null
}

export async function updateUser(
  db: Db,
  id: string,
  patch: { role?: Role | undefined; disabled?: boolean | undefined },
): Promise<AdminUser> {
  await db.transaction(async (tx) => {
    // Serialise every change to the admin set. Without this, two admins demoting each other
    // concurrently would each see the other's row as still enabled (READ COMMITTED) and both commit.
    await tx.execute(sql`select pg_advisory_xact_lock(${LOCK_ADMIN_SET})`)

    const updated = await tx
      .update(users)
      .set({
        ...(patch.role !== undefined ? { role: patch.role } : {}),
        ...(patch.disabled === true
          ? { disabledAt: sql`coalesce(${users.disabledAt}, now())` }
          : {}),
        ...(patch.disabled === false ? { disabledAt: null } : {}),
      })
      .where(eq(users.id, id))
      .returning({ id: users.id })
    if (updated.length === 0) throw new UserNotFoundError()

    // Same transaction as the disable, so there is no window where the account is disabled
    // but a session still exists.
    if (patch.disabled === true) await tx.delete(sessions).where(eq(sessions.userId, id))

    // Mutate first, then assert: the check sees the post-change state. Throwing rolls it all back.
    const remaining = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(users)
      .where(and(eq(users.role, 'admin'), isNull(users.disabledAt)))
    if (remaining[0]!.n < 1) throw new LastAdminError()
  })

  const user = await getAdminUser(db, id)
  if (!user) throw new UserNotFoundError()
  return user
}
