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
    // A low ceiling for this instance only: the test is about the MECHANISM, and asserting the
    // shipped 600 would mean sending 601 requests to learn the same thing.
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
  }, 60_000)

  it('buckets by EMAIL, so one account under attack does not lock out the others', async () => {
    // THE WHOLE POINT OF KEYING BY EMAIL. Behind a reverse proxy every request has the proxy's IP, so an
    // IP-keyed bucket is one bucket for everybody: a stuffing run against one account would
    // take the instance offline for its owner, and spreading that run across a thousand
    // accounts would stay inside a single 20-a-minute allowance.
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
    // THE HALF A PER-EMAIL BUCKET CANNOT COVER. Per-email buckets protect an account; alone they
    // leave the INSTANCE unprotected, because ten thousand addresses are ten thousand buckets --
    // and `authenticate` runs argon2 against a dummy hash even for an address that does not
    // exist, so that is unbounded CPU for the asking.
    //
    // The ceiling is a single counter with no key, so there is nothing to rotate past it. The
    // second version of this control kept a Map keyed by `req.ip` and swept it on every request,
    // which an attacker rotating source addresses turns into the amplifier.
    const codes: number[] = []
    for (let i = 0; i < 70; i++) {
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: { 'x-ctws-client': 'web' },
        payload: { email: `spray-${i}@example.com`, password: 'whatever at all' },
      })
      codes.push(res.statusCode)
    }
    // Every address is its own email bucket, so none of these is throttled for being repeated.
    // The connection's own ceiling is what stops them.
    expect(codes.filter((c) => c === 429).length).toBeGreaterThan(0)
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
