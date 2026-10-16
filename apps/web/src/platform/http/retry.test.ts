import { describe, expect, it } from 'vitest'
import { ApiError, OutdatedPageError } from './api'
import { retryOnce } from './retry'

describe('retryOnce', () => {
  it.each([
    ['no answer at all', new TypeError('Failed to fetch')],
    ['a server error', new ApiError(502, 'Bad Gateway')],
    ['a rate limit', new ApiError(429, 'Too Many Requests')],
  ])('asks again once after %s', (_, error) => {
    expect(retryOnce(0, error)).toBe(true)
    expect(retryOnce(1, error)).toBe(false)
  })

  it.each([
    ['a missing thing', new ApiError(404, 'Not Found')],
    ['a signed-out session', new ApiError(401, 'Unauthorized')],
    ['a refused input', new ApiError(400, 'Bad Request')],
    ['an answer this page cannot read', new OutdatedPageError(false)],
  ])('does not ask again after %s', (_, error) => {
    expect(retryOnce(0, error)).toBe(false)
  })
})
