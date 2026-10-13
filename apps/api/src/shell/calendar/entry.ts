import type { CalendarEntry } from '@ctws/contracts'

/** A calendar entry for a thing that falls on a day, with no time of its own. */
export function dayEntry(e: Omit<CalendarEntry, 'time' | 'endTime' | 'zone'>): CalendarEntry {
  return { ...e, time: null, endTime: null, zone: null }
}
