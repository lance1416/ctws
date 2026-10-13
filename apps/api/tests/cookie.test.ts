import { describe, expect, it } from 'vitest'
import { cookieOptions } from '../src/shell/auth/cookie'
import { parseEnv } from '../src/platform/config'

const base = { DATABASE_URL: 'postgres://u:p@h:5432/d', CORS_ORIGINS: 'https://app.test' }

describe('cookieOptions', () => {
  it('is httpOnly and path-scoped to the whole app', () => {
    const opts = cookieOptions(parseEnv(base))
    expect(opts.httpOnly).toBe(true)
    expect(opts.path).toBe('/')
  })

  it('defaults to lax for same-site deployments', () => {
    expect(cookieOptions(parseEnv(base)).sameSite).toBe('lax')
  })

  // The none-requires-secure invariant itself is enforced and tested in env.test.ts; this only
  // checks that cookieOptions mirrors the parsed env.
  it('mirrors the parsed sameSite and secure settings', () => {
    const opts = cookieOptions(
      parseEnv({ ...base, COOKIE_SAMESITE: 'none', COOKIE_SECURE: 'true' }),
    )
    expect(opts.sameSite).toBe('none')
    expect(opts.secure).toBe(true)
  })

  it('omits domain when none is configured', () => {
    expect(cookieOptions(parseEnv(base)).domain).toBeUndefined()
  })

  it('passes a configured domain through', () => {
    const opts = cookieOptions(parseEnv({ ...base, COOKIE_DOMAIN: '.ctws.test' }))
    expect(opts.domain).toBe('.ctws.test')
  })
})
