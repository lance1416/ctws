import { expect } from 'vitest'

// Runs a statement expected to fail and returns the Postgres SQLSTATE it failed with. drizzle wraps
// the driver error, so the code sits on `.cause`, not on the thrown error; this walks the cause
// chain the same way isUniqueViolation does in src/auth/service.ts (deliberately mirrored). Asserting
// the SQLSTATE proves *why* it failed, so a typo in the statement itself cannot pass as a refusal.
export async function sqlStateOf(statement: PromiseLike<unknown>): Promise<string | undefined> {
  let error: unknown
  try {
    await statement
  } catch (e) {
    error = e
  }
  expect(error, 'statement was expected to fail').toBeDefined()
  let current = error as { code?: unknown; cause?: unknown } | undefined
  for (let depth = 0; current && depth < 5; depth++) {
    if (typeof current.code === 'string') return current.code
    current =
      typeof current.cause === 'object' && current.cause !== null
        ? (current.cause as typeof current)
        : undefined
  }
  return undefined
}
