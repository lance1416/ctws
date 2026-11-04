import { ApiError, OutdatedPageError } from './api'
import { OFFLINE_WHY } from './online'

/**
 * Whether a failed read is asked again: once, and only when asking again can help. A request that
 * never got an answer, a server error and a rate limit may pass; any other refusal is the answer.
 */
export function retryOnce(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1) return false
  if (!(error instanceof ApiError)) return error instanceof TypeError
  return error.status >= 500 || error.status === 429
}

/**
 * Why a write is not worth sending again, in the server's words: it refused it, or the page is
 * out of date, or there is no connection. Null when trying again may work.
 */
export function refusalText(error: unknown): string | null {
  if (error instanceof OutdatedPageError) return error.message
  if (error instanceof TypeError && typeof navigator !== 'undefined' && navigator.onLine === false)
    return OFFLINE_WHY
  if (!(error instanceof ApiError) || retryOnce(0, error)) return null
  return error.detail ?? error.message
}
