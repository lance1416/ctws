import { api } from '@ctws/contracts'
import { queryOptions } from '@tanstack/react-query'
import { call } from '../../platform/http/api'

/** The report of the move to the new layout (FR-099); the account names it until it is Done. */
export const migrationKeys = { report: ['migration'] as const }

export const migrationQuery = () =>
  queryOptions({
    queryKey: migrationKeys.report,
    queryFn: ({ signal }) => call(api.migration.get, {}, { signal }),
  })

export const setTimeZone = (timezone: string) => call(api.auth.updateMe, { body: { timezone } })

export const changePassword = (current: string, next: string) =>
  call(api.auth.changePassword, { body: { current, next } })

/** One guess marked looked at, or not; the report as it is now. */
export const checkItem = (key: string, checked: boolean) =>
  call(api.migration.check, { params: { key }, body: { checked } })

/** Done with the report: it and its prompts go. */
export const finishReport = () => call(api.migration.done)
