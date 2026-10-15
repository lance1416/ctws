import type { BirthdaysResponse, CalendarEntry } from '@ctws/contracts'
import { apiFetch } from '../../../platform/http/api'

/**
 * The birthdays page, in one request: the segments, the month index and the circle counts are all
 * worked out by the server, so there is nothing here but the fetch.
 */
export const birthdaysKey = () => ['birthdays'] as const

export function listBirthdays(): Promise<BirthdaysResponse> {
  return apiFetch('/people/birthdays')
}

/** This module's dated things, for the shell's grid. */
export function birthdayCalendar(range: { from: string; to: string }): Promise<CalendarEntry[]> {
  const params = new URLSearchParams(range)
  return apiFetch<{ entries: CalendarEntry[] }>(`/people/calendar?${params}`).then((r) => r.entries)
}
