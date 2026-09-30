import { eq } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import type { Db } from '../db/client'
import { users, workspaceMembers, workspaces } from '../db/schema'
import { hashPassword, verifyPassword } from './password'

export class EmailTakenError extends Error {
  constructor() {
    super('email already registered')
  }
}

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

export async function registerUser(
  db: Db,
  input: { email: string; password: string; timezone: string },
): Promise<{ userId: string; workspaceId: string }> {
  const userId = uuidv7()
  const workspaceId = uuidv7()
  const passwordHash = await hashPassword(input.password)

  try {
    // One transaction: the user, workspace and membership inserts either all
    // succeed or all fail. Otherwise a duplicate-email failure on the user
    // insert could leave an orphan workspace behind -- see Review Focus #5.
    await db.transaction(async (tx) => {
      await tx
        .insert(users)
        .values({ id: userId, email: input.email, passwordHash, timezone: input.timezone })
      await tx.insert(workspaces).values({ id: workspaceId, name: 'My Workspace' })
      await tx.insert(workspaceMembers).values({ workspaceId, userId, role: 'owner' })
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
// (or a hardcoded hash drifting from the library's current cost params)
// could leak whether an email is registered. Derived lazily from
// `hashPassword` at first use, rather than hard-coded as the brief
// suggests, so it always reflects this deployment's actual argon2
// parameters instead of a string frozen at the time this file was written.
// Tradeoff: the very first login attempt after process start pays for one
// extra hash instead of zero, and this constant is per-process rather than
// a fixed literal -- both acceptable given the alternative (a value that
// silently stops matching current cost parameters as the library or its
// defaults change).
let dummyHash: Promise<string> | undefined
function getDummyHash(): Promise<string> {
  if (!dummyHash) dummyHash = hashPassword('unused-dummy-password-for-timing-equalisation')
  return dummyHash
}

export async function authenticate(
  db: Db,
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
    // response time.
    await verifyPassword(await getDummyHash(), password)
    return null
  }
  return (await verifyPassword(row.passwordHash, password)) ? { userId: row.id } : null
}

// Shared by the login route and `requireUser` so the workspace-membership
// lookup lives in one place instead of being duplicated across the routing
// layer -- see design spec §10.5 (queries are scoped by workspace in the
// service layer, not left to route handlers to remember).
export async function getWorkspaceIdForUser(db: Db, userId: string): Promise<string | null> {
  const rows = await db
    .select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId))
    .limit(1)
  return rows[0]?.workspaceId ?? null
}

export async function loadUser(
  db: Db,
  userId: string,
  workspaceId: string,
): Promise<{ id: string; email: string; timezone: string; workspaceId: string } | null> {
  // Select explicit columns -- never the whole row -- so the password hash
  // can never end up in a response body.
  const rows = await db
    .select({ id: users.id, email: users.email, timezone: users.timezone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  const row = rows[0]
  return row ? { ...row, workspaceId } : null
}
