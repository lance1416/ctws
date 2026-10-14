import type { TodayTaskResponse } from '@ctws/contracts'
import { apiFetch, calendarOf } from '../../../platform/http/api'

// The single accessor for the ['today'] cache key. The server owns segment assignment and the
// order within each segment; nothing here re-derives either.
export async function listToday(): Promise<TodayTaskResponse[]> {
  return (await apiFetch<{ tasks: TodayTaskResponse[] }>('/tasks/today')).tasks
}

export const taskCalendar = (range: { from: string; to: string }) => calendarOf('/tasks', range)
