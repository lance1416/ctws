import type { ReviewResponse } from '@ctws/contracts'
import { apiFetch } from '../api'

/**
 * The single accessor for the ['review'] cache key. The window is the SERVER's -- it decides the
 * week boundary in the account's zone, and reports the bounds it used, so nothing here guesses.
 */
export async function listReview(range?: { from: string; to: string }): Promise<ReviewResponse> {
  const query = range ? `?from=${range.from}&to=${range.to}` : ''
  return apiFetch<ReviewResponse>(`/tasks/review${query}`)
}
