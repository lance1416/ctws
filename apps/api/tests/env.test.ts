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

  it('requires an invite code when registration is invite-only', () => {
    expect(() => parseEnv({ ...base, AUTH_REGISTRATION: 'invite' })).toThrow(/AUTH_INVITE_CODE/)
  })

  it('rejects an unknown AUTH_REGISTRATION value', () => {
    expect(() => parseEnv({ ...base, AUTH_REGISTRATION: 'everyone' })).toThrow()
  })
})
