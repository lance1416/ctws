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

// drizzle-orm 0.45.3 wraps the driver's pg error in a DrizzleQueryError.
// The wrapper itself has no `code` property -- the original pg error (with
// the Postgres SQLSTATE) is on `error.cause`, not on `error` directly.
// Verified empirically by logging the caught error for a duplicate-email
// insert: `error.code` was `undefined`, `error.cause.code` was `'23505'`.
function isUniqueViolation(error: unknown): boolean {
  const cause = (error as { cause?: { code?: unknown } } | undefined)?.cause
  return (cause as { code?: unknown } | undefined)?.code === UNIQUE_VIOLATION
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
