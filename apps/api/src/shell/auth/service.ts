import {
  type Role,
  type UserId,
  type WorkspaceId,
  userId as userIdSchema,
  workspaceId as workspaceIdSchema,
} from '@ctws/contracts'
import { newId } from '../../platform/db/ids'
import { and, asc, eq, isNull, sql } from 'drizzle-orm'
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
  opts: { now: Date; explicitRole?: Role; onlyIfFirst?: boolean },
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
          createdAt: opts.now,
          role:
            opts.explicitRole ??
            sql`case when not exists (select 1 from users) then 'admin' else 'member' end`,
        })
        .returning({ role: users.role })
      await tx
        .insert(workspaces)
        .values({ id: workspaceId, createdAt: opts.now, movedAt: opts.now })
      await tx.insert(workspaceMembers).values({ workspaceId, userId, joinedAt: opts.now })
      await createInbox(tx, { workspaceId, now: opts.now })
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

/** An account as a request acts for it: who, in which workspace, with which instance role. */
export type Account = {
  id: UserId
  email: string
  timezone: string
  workspaceId: WorkspaceId
  role: Role
}

/** An account's columns, named so the password hash cannot reach a response. */
export const ACCOUNT = {
  id: users.id,
  email: users.email,
  timezone: users.timezone,
  workspaceId: workspaceMembers.workspaceId,
  role: users.role,
}

/** An account's first workspace: `joinedAt` can tie within one transaction; the id breaks it. */
export const FIRST_WORKSPACE = [asc(workspaceMembers.joinedAt), asc(workspaceMembers.workspaceId)]

/** An enabled account, or null for a disabled one. */
export async function loadAccount(db: Queryable, userId: UserId): Promise<Account | null> {
  const [row] = await db
    .select(ACCOUNT)
    .from(users)
    .innerJoin(workspaceMembers, eq(workspaceMembers.userId, users.id))
    .where(and(eq(users.id, userId), isNull(users.disabledAt)))
    .orderBy(...FIRST_WORKSPACE)
    .limit(1)
  return row ?? null
}

/** The account's zone, from now on the one every day boundary is decided in. */
export async function setTimezone(db: Queryable, userId: UserId, timezone: string): Promise<void> {
  await db.update(users).set({ timezone }).where(eq(users.id, userId))
}

/** Whether single keys act for this account (FR-029). */
export async function singleKeyShortcuts(db: Queryable, userId: UserId): Promise<boolean> {
  const [row] = await db
    .select({ on: users.singleKeyShortcuts })
    .from(users)
    .where(eq(users.id, userId))
  return row?.on ?? true
}

export async function setSingleKeyShortcuts(
  db: Queryable,
  userId: UserId,
  on: boolean,
): Promise<void> {
  await db.update(users).set({ singleKeyShortcuts: on }).where(eq(users.id, userId))
}

/** When the password was last changed here, or null for the one set at sign-up. */
export async function passwordChangedAt(db: Queryable, userId: UserId): Promise<Date | null> {
  const [row] = await db
    .select({ at: users.passwordChangedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  return row?.at ?? null
}

/** A new password, given the current one; false, and nothing changed, when that is not it. */
export async function changePassword(
  db: Queryable,
  userId: UserId,
  { current, next }: { current: string; next: string },
  now: Date,
): Promise<boolean> {
  const [row] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  if (!row || !(await verifyPassword(row.passwordHash, current))) return false
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(next), passwordChangedAt: now })
    .where(eq(users.id, userId))
  return true
}
