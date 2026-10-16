import type { SQL } from 'drizzle-orm'
import type { PgInsertValue, PgTable } from 'drizzle-orm/pg-core'
import type { Tx } from './client'

/**
 * Makes `rows` the whole set that `owned` selects: an owner's child rows are written as a set,
 * never patched one by one. Inside the caller's transaction, so no reader sees the set half-made.
 */
export async function replaceRows<T extends PgTable>(
  tx: Tx,
  table: T,
  owned: SQL,
  rows: PgInsertValue<T>[],
): Promise<void> {
  await tx.delete(table).where(owned)
  if (rows.length > 0) await tx.insert(table).values(rows)
}
