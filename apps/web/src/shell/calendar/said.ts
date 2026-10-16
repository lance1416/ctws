import type { CalendarEntry } from '@ctws/contracts'
import { clockTime, zoneAbbreviation } from '@ctws/core/clock'
import type { SaidEntry } from '../contract'

/** An entry's times on the account's clock, and on its own zone's when that is another. */
export function said(e: CalendarEntry, accountZone: string): SaidEntry {
  const at = e.startsAt ? new Date(e.startsAt) : null
  const elsewhere = at && e.timeZone && e.timeZone !== accountZone ? e.timeZone : null
  return {
    ...e,
    time: at ? clockTime(at, accountZone) : null,
    endTime: e.endsAt ? clockTime(new Date(e.endsAt), accountZone) : null,
    zone: at && elsewhere ? zoneAbbreviation(at, elsewhere) : null,
    zoneTime: at && elsewhere ? clockTime(at, elsewhere) : null,
  }
}
