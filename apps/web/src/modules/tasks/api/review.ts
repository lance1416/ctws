import { api } from '@ctws/contracts'
import { call } from '../../../platform/http/api'

/** The server picks the week in the account's zone and reports the bounds it used. */
export const listReview = (range?: { from: string; to: string }) =>
  call(api.tasks.review, { query: range ?? {} })
