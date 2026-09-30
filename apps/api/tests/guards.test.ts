import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { requiresCsrfHeader } from '../src/guards'
import { withApp } from './helpers/app'

const ORIGIN = 'https://app.test'
const LOGIN_BODY = { email: 'a@b.com', password: 'whatever at all' }

describe('CORS and CSRF', () => {
  let ctx: Awaited<ReturnType<typeof withApp>>

  beforeAll(async () => {
    ctx = await withApp({ authRegistration: 'open', corsOrigins: [ORIGIN] })
  }, 120_000)

  afterAll(async () => {
    await ctx?.stop()
  })

  describe('CORS', () => {
    it('allows an allow-listed origin', async () => {
      const res = await ctx.app.inject({
        method: 'GET',
        url: '/api/v1/health',
        headers: { origin: ORIGIN },
      })
      expect(res.headers['access-control-allow-origin']).toBe(ORIGIN)
      expect(res.headers['access-control-allow-credentials']).toBe('true')
    })

    it('does not echo an origin that is not allow-listed', async () => {
      const res = await ctx.app.inject({
        method: 'GET',
        url: '/api/v1/health',
        headers: { origin: 'https://evil.test' },
      })
      expect(res.headers['access-control-allow-origin']).toBeUndefined()
    })

    it('does not answer a preflight from a non-allow-listed origin', async () => {
      const res = await ctx.app.inject({
        method: 'OPTIONS',
        url: '/api/v1/auth/login',
        headers: {
          origin: 'https://evil.test',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type,x-ctws-client',
        },
      })
      expect(res.headers['access-control-allow-origin']).toBeUndefined()
    })

    // A preflight carries no custom headers: it asks permission to send them. If the CSRF
    // check caught it, every cross-origin write from a browser would fail.
    it('answers the preflight for a write without requiring the CSRF header', async () => {
      const res = await ctx.app.inject({
        method: 'OPTIONS',
        url: '/api/v1/auth/login',
        headers: {
          origin: ORIGIN,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type,x-ctws-client',
        },
      })
      expect(res.statusCode).toBeLessThan(300)
      expect(res.headers['access-control-allow-origin']).toBe(ORIGIN)
      expect(res.headers['access-control-allow-credentials']).toBe('true')
      expect(String(res.headers['access-control-allow-methods'])).toContain('POST')
      expect(String(res.headers['access-control-allow-headers']).toLowerCase()).toContain(
        'x-ctws-client',
      )
    })
  })

  describe('CSRF', () => {
    it('rejects a write without the custom header', async () => {
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: { origin: ORIGIN },
        payload: LOGIN_BODY,
      })
      expect(res.statusCode).toBe(403)
      expect(res.headers['content-type']).toContain('application/problem+json')
    })

    it('allows a write with the custom header', async () => {
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: { origin: ORIGIN, 'x-ctws-client': 'web' },
        payload: LOGIN_BODY,
      })
      // The credentials are wrong, but the request got past the CSRF gate.
      expect(res.statusCode).toBe(401)
    })

    it('does not require the header for reads', async () => {
      const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/health' })
      expect(res.statusCode).toBe(200)
    })
  })
})

// Own app instance: exhausting the login bucket here must not leak a 429 into the tests above.
describe('rate limiting', () => {
  let ctx: Awaited<ReturnType<typeof withApp>>

  beforeAll(async () => {
    ctx = await withApp({ authRegistration: 'open', corsOrigins: [ORIGIN] })
  }, 120_000)

  afterAll(async () => {
    await ctx?.stop()
  })

  it('returns 429 after too many login attempts', async () => {
    const attempt = () =>
      ctx.app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: { origin: ORIGIN, 'x-ctws-client': 'web' },
        payload: { email: 'flood@example.com', password: 'whatever at all' },
      })

    const codes: number[] = []
    for (let i = 0; i < 25; i++) codes.push((await attempt()).statusCode)
    // The limit is 20 per minute: the first 20 are real 401s, the rest are throttled.
    expect(codes.slice(0, 20).every((c) => c === 401)).toBe(true)
    expect(codes.slice(20).every((c) => c === 429)).toBe(true)
  }, 60_000)

  it('does not rate limit the health check', async () => {
    const codes: number[] = []
    for (let i = 0; i < 25; i++) {
      codes.push((await ctx.app.inject({ method: 'GET', url: '/api/v1/health' })).statusCode)
    }
    expect(new Set(codes)).toEqual(new Set([200]))
  })
})

describe('requiresCsrfHeader', () => {
  // Pins the safe-method set directly: the integration preflight test cannot catch a
  // regression here, because the CORS plugin answers OPTIONS before the CSRF hook runs.
  it.each(['GET', 'HEAD', 'OPTIONS'])('does not require the header for %s', (method) => {
    expect(requiresCsrfHeader(method)).toBe(false)
  })

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('requires the header for %s', (method) => {
    expect(requiresCsrfHeader(method)).toBe(true)
  })
})
