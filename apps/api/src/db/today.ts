import { sql } from 'drizzle-orm'
import type { Queryable } from './client'

/**
 * TODAY, IN THE ACCOUNT'S ZONE, as `YYYY-MM-DD`.
 *
 * Postgres does the arithmetic, not Node: the zone and DST rules have an authoritative answer in
 * the database, and getting "which day is it" wrong raises no error -- it just shows today's
 * birthday as "in 1 day" for half the world. `tasks/today.ts` carries an inline copy of the same
 * expression because its statement also needs the t0/t1 bounds from it.
 *
 * `clock` exists only so the zone behaviour can be tested at a fixed instant.
 */
export async function accountToday(
  q: Queryable,
  timezone: string,
  clock: Date = new Date(),
): Promise<string> {
  const result = await q.execute(
    sql`select (${clock.toISOString()}::timestamptz at time zone ${timezone})::date::text as today`,
  )
  const row = (result.rows as { today: string }[])[0]
  if (!row) throw new Error('postgres did not answer what day it is')
  return row.today
}
