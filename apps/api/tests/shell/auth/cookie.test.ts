import { describe, expect, it } from 'vitest'
import { cookieOptions } from '../../../src/shell/auth/cookie'
import { parseEnv } from '../../../src/platform/config'

const base = { DATABASE_URL: 'postgres://u:p@h:5432/d' }

describe('cookieOptions', () => {
  it('is httpOnly and path-scoped to the whole app', () => {
    const opts = cookieOptions(parseEnv(base))
    expect(opts.httpOnly).toBe(true)
    expect(opts.path).toBe('/')
  })

  it('is lax and host-only', () => {
    const opts = cookieOptions(parseEnv(base))
    expect(opts.sameSite).toBe('lax')
    expect(opts.domain).toBeUndefined()
  })

  it('mirrors the parsed secure setting', () => {
    expect(cookieOptions(parseEnv(base)).secure).toBe(true)
    expect(cookieOptions(parseEnv({ ...base, COOKIE_SECURE: 'false' })).secure).toBe(false)
  })
})
