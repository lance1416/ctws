import type { BirthdaysResponse, CalendarEntry } from '@ctws/contracts'
import { apiFetch } from '../api'

/**
 * The birthdays page, in one request: the segments, the month index and the circle counts are all
 * worked out by the server (design spec section 8.4), so there is nothing here but the fetch.
 */
export const birthdaysKey = () => ['birthdays'] as const

export function listBirthdays(): Promise<BirthdaysResponse> {
  return apiFetch('/contacts/birthdays')
}

/** This module's dated things, for the shell's grid. */
export function birthdayCalendar(range: { from: string; to: string }): Promise<CalendarEntry[]> {
  const params = new URLSearchParams(range)
  return apiFetch<{ entries: CalendarEntry[] }>(`/contacts/calendar?${params}`).then(
    (r) => r.entries,
  )
}

/**
 * What each day in the window is called in the lunar calendar. The SHELL's endpoint, not this
 * module's: a day's own name belongs to the day.
 */
export function calendarDays(range: { from: string; to: string }): Promise<Record<string, string>> {
  const params = new URLSearchParams(range)
  return apiFetch<{ days: Record<string, string> }>(`/calendar/days?${params}`).then((r) => r.days)
}
