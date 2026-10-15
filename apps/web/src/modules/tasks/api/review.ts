import type { ReviewResponse } from '@ctws/contracts'
import { apiFetch } from '../../../platform/http/api'

/** The server picks the week in the account's zone and reports the bounds it used. */
export async function listReview(range?: { from: string; to: string }): Promise<ReviewResponse> {
  const query = range ? `?from=${range.from}&to=${range.to}` : ''
  return apiFetch<ReviewResponse>(`/tasks/review${query}`)
}
