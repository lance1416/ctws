import { sql } from 'drizzle-orm'
import type { Tx } from './client'

/**
 * The shell's advisory lock keys. Every key is in the 7_301_xxx series so none collide; a module
 * that takes a lock keeps its own key in the series, beside the code that takes it.
 */
export const LOCKS = {
  firstUser: 7_301_001,
  adminSet: 7_301_002,
} as const

/** Holds a transaction-scoped advisory lock, optionally per `scope`, until the transaction ends. */
export async function lockFor(tx: Tx, key: number, scope?: string): Promise<void> {
  await tx.execute(
    scope === undefined
      ? sql`select pg_advisory_xact_lock(${key})`
      : sql`select pg_advisory_xact_lock(${key}, hashtext(${scope}))`,
  )
}
