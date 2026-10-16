import {
  type Role,
  type UserId,
  type WorkspaceId,
  userId as userIdSchema,
  workspaceId as workspaceIdSchema,
} from '@ctws/contracts'
import { newId } from '../../platform/db/ids'
import { and, eq, isNull, sql } from 'drizzle-orm'
import type { Db, Queryable } from '../../platform/db/client'
import { LOCKS, lockFor } from '../../platform/db/locks'
import { isUniqueViolation } from '../../platform/db/sql'
import { createInbox } from '../projects/service'
import { EmailTakenError, RegistrationClosedError } from './errors'
import { hashPassword, verifyPassword } from './password'
import { users, workspaceMembers, workspaces } from './tables'

/**
 * Creates a user with their own workspace and inbox. Without `explicitRole` the first user ever
 * becomes admin and everyone else member; `onlyIfFirst` refuses unless there are no users yet,
 * which is how a closed instance still takes its first account.
 */
export async function registerUser(
  db: Db,
  input: { email: string; password: string; timezone: string },
  opts: { explicitRole?: Role; onlyIfFirst?: boolean } = {},
): Promise<{ userId: UserId; workspaceId: WorkspaceId; role: Role }> {
  const userId = newId(userIdSchema)
  const workspaceId = newId(workspaceIdSchema)
  // Hashed before the "is registration open" check: one path, and the limits bound the cost.
  const passwordHash = await hashPassword(input.password)

  try {
    return await db.transaction(async (tx) => {
      if (!opts.explicitRole) {
        // Two concurrent first registrations would both see an empty table without it.
        await lockFor(tx, LOCKS.firstUser)
        if (opts.onlyIfFirst) {
          const existing = await tx.select({ id: users.id }).from(users).limit(1)
          if (existing.length > 0) throw new RegistrationClosedError()
        }
      }
      const [user] = await tx
        .insert(users)
        .values({
          id: userId,
          email: input.email,
          passwordHash,
          timezone: input.timezone,
          role:
            opts.explicitRole ??
            sql`case when not exists (select 1 from users) then 'admin' else 'member' end`,
        })
        .returning({ role: users.role })
      await tx.insert(workspaces).values({ id: workspaceId })
      await tx.insert(workspaceMembers).values({ workspaceId, userId })
      await createInbox(tx, workspaceId)
      return { userId, workspaceId, role: user!.role }
    })
  } catch (error) {
    if (isUniqueViolation(error)) throw new EmailTakenError()
    throw error
  }
}

/**
 * A hash to verify against when the email is unknown, so that path costs one argon2 verify like a
 * wrong password does. Lazy, and warmed by `buildApp` before the server listens.
 */
let dummyHash: Promise<string> | undefined
const getDummyHash = (): Promise<string> =>
  (dummyHash ??= hashPassword('unused-dummy-password-for-timing-equalisation'))

export async function warmDummyHash(): Promise<void> {
  await getDummyHash()
}

export async function authenticate(
  db: Queryable,
  email: string,
  password: string,
): Promise<{ userId: UserId } | null> {
  const [row] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)
  if (!row) {
    await verifyPassword(await getDummyHash(), password)
    return null
  }
  return (await verifyPassword(row.passwordHash, password)) ? { userId: row.id } : null
}

type AuthContext = { workspaceId: WorkspaceId; role: Role; timezone: string }

/**
 * The workspace and instance role of an enabled user, read on every request so disabling or
 * demoting an account applies at once.
 */
export async function getAuthContext(db: Queryable, userId: UserId): Promise<AuthContext | null> {
  const [row] = await db
    .select({
      workspaceId: workspaceMembers.workspaceId,
      role: users.role,
      timezone: users.timezone,
    })
    .from(users)
    .innerJoin(workspaceMembers, eq(workspaceMembers.userId, users.id))
    .where(and(eq(users.id, userId), isNull(users.disabledAt)))
    // `joinedAt` can tie within one transaction; the workspace id breaks it.
    .orderBy(workspaceMembers.joinedAt, workspaceMembers.workspaceId)
    .limit(1)
  return row ?? null
}

export async function loadUser(
  db: Queryable,
  userId: UserId,
  ctx: AuthContext,
): Promise<{
  id: UserId
  email: string
  timezone: string
  workspaceId: WorkspaceId
  role: Role
}> {
  // Named columns only, so the password hash cannot reach a response.
  const [row] = await db
    .select({ id: users.id, email: users.email, timezone: users.timezone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  return { ...row!, workspaceId: ctx.workspaceId, role: ctx.role }
}
