import type { TodayTaskResponse } from '@ctws/contracts'
import { apiFetch, calendarOf } from '../../../platform/http/api'

// The server owns the segments and their order; nothing here re-derives either.
export async function listToday(): Promise<TodayTaskResponse[]> {
  return (await apiFetch<{ tasks: TodayTaskResponse[] }>('/tasks/today')).tasks
}

export const taskCalendar = (range: { from: string; to: string }) => calendarOf('/tasks', range)
