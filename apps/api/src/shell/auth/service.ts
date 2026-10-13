import type { Role } from '@ctws/contracts'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import type { Db, Queryable } from '../../platform/db/client'
import { LOCKS, lockFor } from '../../platform/db/locks'
import { createInbox } from '../projects/service'
import { users, workspaceMembers, workspaces } from './tables'
import { EmailTakenError, RegistrationClosedError } from './errors'
import { hashPassword, verifyPassword } from './password'

const UNIQUE_VIOLATION = '23505'
const MAX_CAUSE_DEPTH = 5

type ErrorWithCause = { code?: unknown; cause?: unknown }

function asErrorWithCause(value: unknown): ErrorWithCause | undefined {
  return typeof value === 'object' && value !== null ? (value as ErrorWithCause) : undefined
}

// drizzle-orm 0.45.3 wraps the driver's pg error in a DrizzleQueryError.
// The wrapper itself has no `code` property -- the original pg error (with
// the Postgres SQLSTATE) is one level down, on `error.cause`. Verified
// empirically by logging the caught error for a duplicate-email insert:
// `error.code` was `undefined`, `error.cause.code` was `'23505'`.
//
// We walk the `.cause` chain instead of probing that one fixed depth,
// because pinning the check to exactly one level is fragile in a way that
// matters: if a future drizzle version, a different driver path, or a
// deeper wrap moves the SQLSTATE, a fixed-depth check would silently stop
// matching and every duplicate-email registration would quietly become an
// unlogged 500 instead of a 409 -- no exception, no log, no failing test.
// The walk is capped and cycle-safe (via the depth cap) so a malformed or
// self-referential error object can never make this loop forever.
export function isUniqueViolation(error: unknown): boolean {
  let current = asErrorWithCause(error)
  for (let depth = 0; current && depth < MAX_CAUSE_DEPTH; depth++) {
    if (current.code === UNIQUE_VIOLATION) return true
    current = asErrorWithCause(current.cause)
  }
  return false
}

// `explicitRole` is for admin-created users. Without it the role is decided by the database in
// the same statement as the insert: the first user ever becomes admin, everyone else member.
// `onlyIfFirst` refuses (RegistrationClosedError, worded for that mode) unless the users table is
// empty -- it is how a closed or invite-only instance still lets the very first account through.
// Takes `Db`, not `Queryable`: it opens its own transaction, which a `Queryable` cannot promise.
export async function registerUser(
  db: Db,
  input: { email: string; password: string; timezone: string },
  opts: { explicitRole?: Role; onlyIfFirst?: 'closed' | 'invite' } = {},
): Promise<{ userId: string; workspaceId: string }> {
  const userId = uuidv7()
  const workspaceId = uuidv7()
  // HASHED BEFORE THE "is registration open" CHECK, which costs a closed instance one argon2
  // per refused request. It is one code path instead of two, and the per-email limiter plus the
  // instance ceiling already bound what a flood can spend here.
  const passwordHash = await hashPassword(input.password)

  try {
    // One transaction: the user, workspace and membership inserts either all
    // succeed or all fail. Otherwise a duplicate-email failure on the user
    // insert could leave an orphan workspace behind -- see Review Focus #5.
    await db.transaction(async (tx) => {
      if (!opts.explicitRole) {
        // READ COMMITTED lets two concurrent first registrations both see an empty table, so
        // the CASE below alone is not enough. The lock makes check-and-insert exclusive: the
        // second transaction waits, then sees the first user and becomes a member (or is refused).
        await lockFor(tx, LOCKS.firstUser)
        if (opts.onlyIfFirst) {
          const existing = await tx.select({ id: users.id }).from(users).limit(1)
          if (existing.length > 0) throw new RegistrationClosedError(opts.onlyIfFirst)
        }
      }
      await tx.insert(users).values({
        id: userId,
        email: input.email,
        passwordHash,
        timezone: input.timezone,
        role:
          opts.explicitRole ??
          sql`case when not exists (select 1 from users) then 'admin' else 'member' end`,
      })
      await tx.insert(workspaces).values({ id: workspaceId, name: 'My Workspace' })
      await tx.insert(workspaceMembers).values({ workspaceId, userId, role: 'owner' })
      await createInbox(tx, workspaceId)
    })
  } catch (error) {
    if (isUniqueViolation(error)) throw new EmailTakenError()
    throw error
  }

  return { userId, workspaceId }
}

// A constant-cost stand-in for a real password hash, used for the
// unknown-email path below so that logging in with an unregistered email
// still pays for one argon2id verification -- otherwise the response time
// could leak whether an email is registered. Derived from `hashPassword`
// rather than hard-coded, so it always reflects this deployment's actual
// argon2 parameters instead of a string frozen at the time of writing.
//
// The getter is memoised and lazy on purpose: importing this module stays
// free of side effects (no argon2 work starts at import time, and no promise
// sits unobserved where a rejection would be unhandled). The warm guarantee
// comes from `buildApp` awaiting `warmDummyHash` before the server accepts
// requests, not from module evaluation order -- so the first real login,
// known or unknown email, never pays for hashing, and both paths cost
// exactly one argon2 verify.
let dummyHash: Promise<string> | undefined
function getDummyHash(): Promise<string> {
  return (dummyHash ??= hashPassword('unused-dummy-password-for-timing-equalisation'))
}

export async function warmDummyHash(): Promise<void> {
  await getDummyHash()
}

export async function authenticate(
  db: Queryable,
  email: string,
  password: string,
): Promise<{ userId: string } | null> {
  const rows = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)

  const row = rows[0]
  if (!row) {
    // Run a verification against a dummy hash even for an unregistered
    // email, so this path is not distinguishable from a wrong password by
    // response time. The hash is already resolved (see `warmDummyHash`), so
    // this `await` costs nothing beyond the verify itself.
    await verifyPassword(await getDummyHash(), password)
    return null
  }
  return (await verifyPassword(row.passwordHash, password)) ? { userId: row.id } : null
}

export type AuthContext = { workspaceId: string; role: Role; timezone: string }

// Shared by the login route and `requireUser` so the workspace-membership lookup lives in one place
// instead of being duplicated across the routing layer: queries are scoped by workspace in the
// service layer, not left to route handlers to remember.
//
// One query for membership and instance role. Returns null for a disabled user, so a valid
// session stops working the moment an admin disables the account. The role is read here on
// every request rather than stored in the session, so a demotion also applies immediately.
export async function getAuthContext(db: Queryable, userId: string): Promise<AuthContext | null> {
  const rows = await db
    .select({
      workspaceId: workspaceMembers.workspaceId,
      role: users.role,
      timezone: users.timezone,
    })
    .from(users)
    .innerJoin(workspaceMembers, eq(workspaceMembers.userId, users.id))
    .where(and(eq(users.id, userId), isNull(users.disabledAt)))
    // Deterministic pick: joinedAt can tie (rows inserted in one transaction), so workspaceId breaks it.
    .orderBy(workspaceMembers.joinedAt, workspaceMembers.workspaceId)
    .limit(1)
  const row = rows[0]
  return row
    ? { workspaceId: row.workspaceId, role: row.role as Role, timezone: row.timezone }
    : null
}

export async function loadUser(
  db: Queryable,
  userId: string,
  ctx: AuthContext,
): Promise<{
  id: string
  email: string
  timezone: string
  workspaceId: string
  role: Role
} | null> {
  // Select explicit columns -- never the whole row -- so the password hash
  // can never end up in a response body.
  const rows = await db
    .select({ id: users.id, email: users.email, timezone: users.timezone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  const row = rows[0]
  return row ? { ...row, workspaceId: ctx.workspaceId, role: ctx.role } : null
}
