import { api } from '@ctws/contracts'
import { queryOptions } from '@tanstack/react-query'
import { call } from '../../platform/http/api'

type Range = { from: string; to: string }

/** What each day in the window is called in the lunar calendar. A day's own name is the shell's. */
export const calendarDaysQuery = (range: Range) =>
  queryOptions({
    queryKey: ['calendar', 'days', range.from, range.to],
    queryFn: async ({ signal }) =>
      (await call(api.calendar.days, { query: range }, { signal })).days,
  })
