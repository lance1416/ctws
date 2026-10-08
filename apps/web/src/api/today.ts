import type { CalendarEntry, TodayTaskResponse } from '@ctws/contracts'
import { apiFetch } from '../api'

// The single accessor for the ['today'] cache key. The server owns segment assignment and the
// order within each segment; nothing here re-derives either.
export async function listToday(): Promise<TodayTaskResponse[]> {
  return (await apiFetch<{ tasks: TodayTaskResponse[] }>('/tasks/today')).tasks
}

/** This module"s dated things for a window. The DAY is the server's, in the account"s zone. */
export async function taskCalendar(range: { from: string; to: string }): Promise<CalendarEntry[]> {
  const path = `/tasks/calendar?from=${range.from}&to=${range.to}`
  return (await apiFetch<{ entries: CalendarEntry[] }>(path)).entries
}
