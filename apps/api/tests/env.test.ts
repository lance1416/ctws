import { describe, expect, it } from 'vitest'
import { parseEnv } from '../src/env'

const base = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/d',
  CORS_ORIGINS: 'http://localhost:5173',
}

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
    expect(() => parseEnv({ CORS_ORIGINS: base.CORS_ORIGINS })).toThrow(/DATABASE_URL/)
  })

  it('parses CORS_ORIGINS into a list', () => {
    const env = parseEnv({ ...base, CORS_ORIGINS: 'https://a.test, https://b.test' })
    expect(env.corsOrigins).toEqual(['https://a.test', 'https://b.test'])
  })

  it('treats CORS_ORIGINS as optional and defaults it to an empty list', () => {
    const env = parseEnv({ DATABASE_URL: base.DATABASE_URL })
    expect(env.corsOrigins).toEqual([])
  })

  it('treats an empty CORS_ORIGINS as an empty list', () => {
    expect(parseEnv({ ...base, CORS_ORIGINS: '' }).corsOrigins).toEqual([])
  })

  it('treats WEB_DIST as optional', () => {
    expect(parseEnv(base).webDist).toBeUndefined()
    expect(parseEnv({ ...base, WEB_DIST: '/app/apps/web/dist' }).webDist).toBe('/app/apps/web/dist')
  })

  // Review Focus #1 -- SameSite=None without Secure is silently dropped by browsers
  it('rejects COOKIE_SAMESITE=none without secure cookies', () => {
    expect(() => parseEnv({ ...base, COOKIE_SAMESITE: 'none', COOKIE_SECURE: 'false' })).toThrow(
      /SameSite=None requires Secure/i,
    )
  })

  it('allows COOKIE_SAMESITE=none when cookies are secure', () => {
    const env = parseEnv({ ...base, COOKIE_SAMESITE: 'none', COOKIE_SECURE: 'true' })
    expect(env.cookieSameSite).toBe('none')
    expect(env.cookieSecure).toBe(true)
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

  it('requires an invite code when registration is invite-only', () => {
    expect(() => parseEnv({ ...base, AUTH_REGISTRATION: 'invite' })).toThrow(/AUTH_INVITE_CODE/)
  })

  it('rejects an unknown AUTH_REGISTRATION value', () => {
    expect(() => parseEnv({ ...base, AUTH_REGISTRATION: 'everyone' })).toThrow()
  })
})
