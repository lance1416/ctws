import { queryOptions } from '@tanstack/react-query'
import { apiFetch } from '../../platform/http/api'

type Range = { from: string; to: string }

/** What each day in the window is called in the lunar calendar. A day's own name is the shell's. */
function calendarDays(range: Range): Promise<Record<string, string>> {
  const params = new URLSearchParams(range)
  return apiFetch<{ days: Record<string, string> }>(`/calendar/days?${params}`).then((r) => r.days)
}

export const calendarDaysQuery = (range: Range) =>
  queryOptions({
    queryKey: ['calendar', 'days', range.from, range.to],
    queryFn: () => calendarDays(range),
  })
