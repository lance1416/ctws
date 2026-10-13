import { expect } from 'vitest'
import { causeChain } from '../../src/platform/db/sql'

/**
 * Runs a statement expected to fail and returns the SQLSTATE it failed with, which proves why it
 * failed: a typo in the statement cannot pass as a refusal.
 */
export async function sqlStateOf(statement: PromiseLike<unknown>): Promise<string | undefined> {
  let error: unknown
  try {
    await statement
  } catch (e) {
    error = e
  }
  expect(error, 'statement was expected to fail').toBeDefined()
  const code = causeChain(error).find((e) => typeof e.code === 'string')?.code
  return code as string | undefined
}
