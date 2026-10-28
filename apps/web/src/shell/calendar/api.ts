import { api } from '@ctws/contracts'
import { queryOptions } from '@tanstack/react-query'
import { call } from '../../platform/http/api'

type Range = { from: string; to: string }

const calendarKeys = {
  days: (range: Range) => ['calendar', 'days', range.from, range.to] as const,
}

/** Each day in the window in the lunar calendar: its name, and the festival it is on some. */
export const lunarWindowQuery = (range: Range) =>
  queryOptions({
    queryKey: calendarKeys.days(range),
    queryFn: ({ signal }) => call(api.calendar.days, { query: range }, { signal }),
  })

/** What each day in the window is called in the lunar calendar. A day's own name is the shell's. */
export const calendarDaysQuery = (range: Range) =>
  queryOptions({ ...lunarWindowQuery(range), select: (window) => window.days })
