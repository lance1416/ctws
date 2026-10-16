import type { CalendarEntry } from '@ctws/contracts'

/** A calendar entry for a thing that falls on a day, with no time or occurrence of its own. */
export function dayEntry(
  e: Omit<CalendarEntry, 'time' | 'endTime' | 'zone' | 'zoneTime' | 'recurrenceId'>,
): CalendarEntry {
  return { ...e, recurrenceId: null, time: null, endTime: null, zone: null, zoneTime: null }
}
