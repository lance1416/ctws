import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { requiresCsrfHeader } from '../../src/platform/http/guards'
import { withApp } from '../helpers/app'

const LOGIN_BODY = { email: 'a@b.com', password: 'whatever at all' }

describe('CSRF', () => {
  let ctx: Awaited<ReturnType<typeof withApp>>

  beforeAll(async () => {
    ctx = await withApp({ authRegistration: 'open' })
  }, 120_000)

  afterAll(async () => {
    await ctx?.stop()
  })

  it('rejects a write without the custom header', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: LOGIN_BODY,
    })
    expect(res.statusCode).toBe(403)
    expect(res.headers['content-type']).toContain('application/problem+json')
  })

  it('allows a write with the custom header', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'x-ctws-client': 'web' },
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

// Own app instance: exhausting the login bucket here must not leak a 429 into the tests above.
describe('rate limiting', () => {
  let ctx: Awaited<ReturnType<typeof withApp>>

  beforeAll(async () => {
    // A low ceiling for this instance only: the test is about the mechanism, not the shipped
    // number.
    ctx = await withApp({ authRegistration: 'open', authCeiling: 70 })
  }, 120_000)

  afterAll(async () => {
    await ctx?.stop()
  })

  it('returns 429 after too many login attempts', async () => {
    const attempt = () =>
      ctx.app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: { 'x-ctws-client': 'web' },
        payload: { email: 'flood@example.com', password: 'whatever at all' },
      })

    const codes: number[] = []
    for (let i = 0; i < 25; i++) codes.push((await attempt()).statusCode)
    // The limit is 20 per minute: the first 20 are real 401s, the rest are throttled.
    expect(codes.slice(0, 20).every((c) => c === 401)).toBe(true)
    expect(codes.slice(20).every((c) => c === 429)).toBe(true)

    const refused = await attempt()
    expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0)
    expect(refused.json()).toMatchObject({
      type: 'about:blank',
      status: 429,
      title: 'Too Many Requests',
    })
  }, 60_000)

  it('buckets by EMAIL, so one account under attack does not lock out the others', async () => {
    // Behind a reverse proxy every request has the proxy's IP, so an IP-keyed bucket is one bucket
    // for everybody: a stuffing run against one account would lock everyone out.
    const attempt = (email: string) =>
      ctx.app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: { 'x-ctws-client': 'web' },
        payload: { email, password: 'whatever at all' },
      })

    for (let i = 0; i < 25; i++) await attempt('victim@example.com')
    expect((await attempt('victim@example.com')).statusCode).toBe(429)
    // Same IP, same minute, a different account: unaffected.
    expect((await attempt('bystander@example.com')).statusCode).toBe(401)
    // And the case matters as little as the whitespace does, or the bucket is trivially evaded.
    expect((await attempt('  VICTIM@example.com ')).statusCode).toBe(429)
  }, 60_000)

  it('still has an instance-wide ceiling, however many addresses are named', async () => {
    // Per-email buckets protect an account but not the instance: every address is its own
    // bucket, and `authenticate` runs argon2 against a dummy hash even for an address that does
    // not exist. The ceiling is a single counter with no key, so there is nothing to rotate past.
    const refusals = []
    for (let i = 0; i < 70; i++) {
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: { 'x-ctws-client': 'web' },
        payload: { email: `spray-${i}@example.com`, password: 'whatever at all' },
      })
      if (res.statusCode === 429) refusals.push(res)
    }
    // Every address is its own email bucket, so none of these is throttled for being repeated.
    // The connection's own ceiling is what stops them, and it says when to come back.
    expect(refusals.length).toBeGreaterThan(0)
    for (const res of refusals) {
      const seconds = Number(res.headers['retry-after'])
      expect(seconds).toBeGreaterThan(0)
      expect(seconds).toBeLessThanOrEqual(60)
    }
  }, 120_000)

  it('does not rate limit the health check', async () => {
    const codes: number[] = []
    for (let i = 0; i < 25; i++) {
      codes.push((await ctx.app.inject({ method: 'GET', url: '/api/v1/health' })).statusCode)
    }
    expect(new Set(codes)).toEqual(new Set([200]))
  })
})

describe('requiresCsrfHeader', () => {
  it.each(['GET', 'HEAD', 'OPTIONS'])('does not require the header for %s', (method) => {
    expect(requiresCsrfHeader(method)).toBe(false)
  })

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('requires the header for %s', (method) => {
    expect(requiresCsrfHeader(method)).toBe(true)
  })
})
