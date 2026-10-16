import { MAX_CALENDAR_SPAN_DAYS } from '@ctws/contracts'
import { addDays } from '@ctws/core'
import { instantOf } from './occurrences'

/** Two account days as the instants that bound them; `to` runs to the end of its day. */
export function windowOf(from: string, to: string, zone: string): { from: Date; to: Date } {
  return {
    from: instantOf(`${from}T00:00`, zone),
    to: instantOf(`${addDays(to, 1)}T00:00`, zone),
  }
}

/** A window given at least one end: the other is `MAX_CALENDAR_SPAN_DAYS` away. */
export function windowFrom(
  ends: { from?: string | undefined; to?: string | undefined },
  zone: string,
): { from: Date; to: Date } {
  const from = ends.from ?? addDays(ends.to!, -MAX_CALENDAR_SPAN_DAYS)
  return windowOf(from, ends.to ?? addDays(from, MAX_CALENDAR_SPAN_DAYS), zone)
}
