import { sql, type SQL } from 'drizzle-orm'

/** An instant as a `timestamptz` literal for raw SQL. */
export const instant = (now: Date): SQL => sql`${now.toISOString()}::timestamptz`

/** Wall-clock time in `zone` at `now`, as a naive timestamp. */
export const localNow = (now: Date, zone: string): SQL =>
  sql`(${instant(now)} at time zone ${zone})`

/** The account's calendar day at `now`. */
export const localDay = (now: Date, zone: string): SQL => sql`(${localNow(now, zone)})::date`

/**
 * The instant a local day starts, `offsetDays` after today. The days are added to the naive local
 * timestamp, so a DST day keeps its 23 or 25 hours.
 */
export const dayStart = (now: Date, zone: string, offsetDays = 0): SQL =>
  sql`((date_trunc('day', ${localNow(now, zone)}) + make_interval(days => ${offsetDays}::int)) at time zone ${zone})`

/** The instant this week's Monday starts in `zone`. */
export const weekStart = (now: Date, zone: string): SQL =>
  sql`(date_trunc('week', ${localNow(now, zone)}) at time zone ${zone})`
