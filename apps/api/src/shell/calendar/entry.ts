import type { CalendarEntry } from '@ctws/contracts'

/** A calendar entry for a thing that falls on a day, with no time or occurrence of its own. */
export function dayEntry(
  e: Omit<CalendarEntry, 'startsAt' | 'endsAt' | 'timeZone' | 'turns' | 'recurrenceId' | 'joinUrl'>,
): CalendarEntry {
  return {
    ...e,
    recurrenceId: null,
    startsAt: null,
    endsAt: null,
    timeZone: null,
    turns: null,
    joinUrl: null,
  }
}
