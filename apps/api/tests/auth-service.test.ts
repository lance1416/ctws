import { describe, expect, it } from 'vitest'
import { isUniqueViolation } from '../src/shell/auth/service'

describe('isUniqueViolation', () => {
  it('matches the SQLSTATE on the error itself', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true)
  })

  it('matches the SQLSTATE one level down, via cause', () => {
    expect(isUniqueViolation({ cause: { code: '23505' } })).toBe(true)
  })

  it('matches the SQLSTATE two levels down, via cause.cause', () => {
    expect(isUniqueViolation({ cause: { cause: { code: '23505' } } })).toBe(true)
  })

  it('does not match a different SQLSTATE', () => {
    expect(isUniqueViolation({ cause: { code: '23503' } })).toBe(false)
  })

  it('does not match when no code is present anywhere in the chain', () => {
    expect(isUniqueViolation({ cause: { message: 'nope' } })).toBe(false)
  })

  it('returns false and does not hang on a cyclic cause chain', () => {
    const a: { code?: string; cause?: unknown } = {}
    a.cause = a
    expect(isUniqueViolation(a)).toBe(false)
  })
})
