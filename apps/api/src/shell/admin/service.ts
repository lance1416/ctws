import { type AdminUser, type Role, type UserId } from '@ctws/contracts'
import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import type { Db, Queryable } from '../../platform/db/client'
import { LOCKS, lockFor } from '../../platform/db/locks'
import { isoOrNull } from '../../platform/values'
import { sessions, users } from '../auth/tables'
import { LastAdminError, UserNotFoundError } from './errors'

// Explicit columns, never the whole row: the password hash must not be selectable from here.
const adminColumns = {
  id: users.id,
  email: users.email,
  role: users.role,
  disabledAt: users.disabledAt,
  createdAt: users.createdAt,
}

function toAdminUser(
  row: Pick<typeof users.$inferSelect, 'id' | 'email' | 'role' | 'disabledAt' | 'createdAt'>,
): AdminUser {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    disabledAt: isoOrNull(row.disabledAt),
    createdAt: row.createdAt.toISOString(),
  }
}

export async function listUsers(db: Queryable): Promise<AdminUser[]> {
  const rows = await db.select(adminColumns).from(users).orderBy(asc(users.createdAt))
  return rows.map(toAdminUser)
}

export async function getAdminUser(db: Queryable, id: UserId): Promise<AdminUser> {
  const [row] = await db.select(adminColumns).from(users).where(eq(users.id, id)).limit(1)
  return toAdminUser(row!)
}

export async function updateUser(
  db: Db,
  id: UserId,
  patch: { role?: Role | undefined; disabled?: boolean | undefined },
): Promise<AdminUser> {
  return db.transaction(async (tx) => {
    // Serialise every change to the admin set. Without this, two admins demoting each other
    // concurrently would each see the other's row as still enabled (READ COMMITTED) and both commit.
    await lockFor(tx, LOCKS.adminSet)

    const [updated] = await tx
      .update(users)
      .set({
        ...(patch.role !== undefined ? { role: patch.role } : {}),
        ...(patch.disabled === true
          ? { disabledAt: sql`coalesce(${users.disabledAt}, now())` }
          : {}),
        ...(patch.disabled === false ? { disabledAt: null } : {}),
      })
      .where(eq(users.id, id))
      .returning(adminColumns)
    if (!updated) throw new UserNotFoundError()

    // Same transaction as the disable, so there is no window where the account is disabled
    // but a session still exists.
    if (patch.disabled === true) await tx.delete(sessions).where(eq(sessions.userId, id))

    // Mutate first, then assert: the check sees the post-change state. Throwing rolls it all back.
    const remaining = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(users)
      .where(and(eq(users.role, 'admin'), isNull(users.disabledAt)))
    if (remaining[0]!.n < 1) throw new LastAdminError()
    return toAdminUser(updated)
  })
}
