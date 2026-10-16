import { api } from '@ctws/contracts'
import { call } from '../../../platform/http/api'

// The server owns the segments and their order; nothing here re-derives either.
export const listToday = async () => (await call(api.tasks.today)).tasks

export const taskCalendar = async (range: { from: string; to: string }) =>
  (await call(api.tasks.calendar, { query: range })).entries
