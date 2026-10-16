import { describe, expect, it } from 'vitest'
import { parseEnv } from './config'

const base = { DATABASE_URL: 'postgres://u:p@localhost:5432/d' }

describe('parseEnv', () => {
  it('defaults registration to closed', () => {
    expect(parseEnv(base).authRegistration).toBe('closed')
  })

  it('defaults the auth rate limit to 20 and accepts an override', () => {
    expect(parseEnv(base).authRateLimitMax).toBe(20)
    expect(parseEnv({ ...base, AUTH_RATE_LIMIT_MAX: '500' }).authRateLimitMax).toBe(500)
  })

  it.each(['0', '-1', '1.5', 'abc'])('rejects AUTH_RATE_LIMIT_MAX=%s', (value) => {
    expect(() => parseEnv({ ...base, AUTH_RATE_LIMIT_MAX: value })).toThrow()
  })

  it('fails fast when DATABASE_URL is missing', () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/)
  })

  it('treats WEB_DIST as optional', () => {
    expect(parseEnv(base).webDist).toBeUndefined()
    expect(parseEnv({ ...base, WEB_DIST: '/app/apps/web/dist' }).webDist).toBe('/app/apps/web/dist')
  })

  it('defaults to secure cookies and accepts COOKIE_SECURE=false', () => {
    expect(parseEnv(base).cookieSecure).toBe(true)
    expect(parseEnv({ ...base, COOKIE_SECURE: 'false' }).cookieSecure).toBe(false)
  })

  // A deployment template that interpolates a password into the URL produces this, and `pg`
  // reports it as a redacted ERR_INVALID_URL from inside a query -- far from the cause.
  it.each([
    'postgres://ctws:ab/cd+ef=@postgres:5432/ctws',
    'postgres://ctws:pw#1@postgres:5432/ctws',
    'postgres://ctws:pw?x@postgres:5432/ctws',
    'not-a-url',
  ])('rejects an unparseable DATABASE_URL %j', (url) => {
    expect(() => parseEnv({ ...base, DATABASE_URL: url })).toThrow(/not a valid URL/)
  })

  it('names the characters that break the URL, so the message is actionable', () => {
    expect(() => parseEnv({ ...base, DATABASE_URL: 'postgres://u:a/b@h:5432/d' })).toThrow(
      /percent-encoded/,
    )
  })

  it.each(['everyone', 'invite'])('rejects AUTH_REGISTRATION=%s', (value) => {
    expect(() => parseEnv({ ...base, AUTH_REGISTRATION: value })).toThrow()
  })
})
