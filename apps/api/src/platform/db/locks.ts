import { sql } from 'drizzle-orm'
import type { Queryable } from './client'

/** Advisory lock keys, one series so they never collide. */
export const LOCKS = {
  firstUser: 7_301_001,
  adminSet: 7_301_002,
  taskTree: 7_301_003,
} as const

/** Holds a transaction-scoped advisory lock, optionally per `scope`, until the transaction ends. */
export async function lockFor(tx: Queryable, key: number, scope?: string): Promise<void> {
  await tx.execute(
    scope === undefined
      ? sql`select pg_advisory_xact_lock(${key})`
      : sql`select pg_advisory_xact_lock(${key}, hashtext(${scope}))`,
  )
}
