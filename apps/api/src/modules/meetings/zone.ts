import { addDays } from '@ctws/core'
import { instantOf } from './occurrences'

/** Two account days as the instants that bound them; `to` runs to the end of its day. */
export function windowOf(from: string, to: string, zone: string): { from: Date; to: Date } {
  return {
    from: instantOf(`${from}T00:00`, zone),
    to: instantOf(`${addDays(to, 1)}T00:00`, zone),
  }
}
