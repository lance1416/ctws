import { ApiError } from './api'

/**
 * Whether a failed read is asked again: once, and only when asking again can help. A request that
 * never got an answer, a server error and a rate limit may pass; any other refusal is the answer.
 */
export function retryOnce(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1) return false
  if (!(error instanceof ApiError)) return error instanceof TypeError
  return error.status >= 500 || error.status === 429
}
