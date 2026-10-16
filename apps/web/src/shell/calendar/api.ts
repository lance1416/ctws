import { api } from '@ctws/contracts'
import { queryOptions } from '@tanstack/react-query'
import { call } from '../../platform/http/api'

type Range = { from: string; to: string }

const calendarKeys = {
  days: (range: Range) => ['calendar', 'days', range.from, range.to] as const,
}

/** What each day in the window is called in the lunar calendar. A day's own name is the shell's. */
export const calendarDaysQuery = (range: Range) =>
  queryOptions({
    queryKey: calendarKeys.days(range),
    queryFn: async ({ signal }) =>
      (await call(api.calendar.days, { query: range }, { signal })).days,
  })
