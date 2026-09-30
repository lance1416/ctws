import { v7 as uuidv7 } from 'uuid'
import type { Db } from '../db/client'
import { users, workspaceMembers, workspaces } from '../db/schema'
import { hashPassword } from './password'

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
