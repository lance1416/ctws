import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { requiresCsrfHeader } from '../src/guards'
import { withApp } from './helpers/app'

const ORIGIN = 'https://app.test'
const LOGIN_BODY = { email: 'a@b.com', password: 'whatever at all' }

describe('CORS and CSRF', () => {
  let ctx: Awaited<ReturnType<typeof withApp>>

  beforeAll(async () => {
    // A low ceiling for this instance only: the test is about the MECHANISM, and asserting the
    // shipped 600 would mean sending 601 requests to learn the same thing.
    ctx = await withApp({ authRegistration: 'open', corsOrigins: [ORIGIN], authCeiling: 70 })
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

// Same-origin deployment: CORS_ORIGINS is unset, so the allowlist is empty and nothing is allowed.
describe('CORS with no CORS_ORIGINS configured', () => {
  let ctx: Awaited<ReturnType<typeof withApp>>

  beforeAll(async () => {
    ctx = await withApp({ corsOrigins: [] })
  }, 120_000)

  afterAll(async () => {
    await ctx?.stop()
  })

  it('does not grant a cross-origin request access-control-allow-origin', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: { origin: ORIGIN },
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('does not grant a preflight access-control-allow-origin', async () => {
    const res = await ctx.app.inject({
      method: 'OPTIONS',
      url: '/api/v1/auth/login',
      headers: {
        origin: ORIGIN,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type,x-ctws-client',
      },
    })
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })
})

// Own app instance: exhausting the login bucket here must not leak a 429 into the tests above.
describe('rate limiting', () => {
  let ctx: Awaited<ReturnType<typeof withApp>>

  beforeAll(async () => {
    // A low ceiling for this instance only: the test is about the MECHANISM, and asserting the
    // shipped 600 would mean sending 601 requests to learn the same thing.
    ctx = await withApp({ authRegistration: 'open', corsOrigins: [ORIGIN], authCeiling: 70 })
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

  it('buckets by EMAIL, so one account under attack does not lock out the others', async () => {
    // THE WHOLE POINT OF D3. Behind a reverse proxy every request has the proxy's IP, so an
    // IP-keyed bucket is one bucket for everybody: a stuffing run against one account would
    // take the instance offline for its owner, and spreading that run across a thousand
    // accounts would stay inside a single 20-a-minute allowance.
    const attempt = (email: string) =>
      ctx.app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: { origin: ORIGIN, 'x-ctws-client': 'web' },
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
    // THE HALF THE FIRST VERSION OF D3 LOST. Per-email buckets protect an account; alone they
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
        headers: { origin: ORIGIN, 'x-ctws-client': 'web' },
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
  // Pins the safe-method set directly: the integration preflight test cannot catch a
  // regression here, because the CORS plugin answers OPTIONS before the CSRF hook runs.
  it.each(['GET', 'HEAD', 'OPTIONS'])('does not require the header for %s', (method) => {
    expect(requiresCsrfHeader(method)).toBe(false)
  })

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('requires the header for %s', (method) => {
    expect(requiresCsrfHeader(method)).toBe(true)
  })
})

/**
 * EVERY REFUSAL THIS API MAKES IS RFC 9457 (D11).
 *
 * `@fastify/cors` answers a malformed preflight from inside its own hook, in `text/plain`, so it
 * never reaches the error handler -- it was the one error path a client could not parse the way
 * it parses the others. The status is right (a preflight with no requested method IS malformed);
 * only the envelope was wrong.
 */
describe('problem details, on every path', () => {
  let ctx: Awaited<ReturnType<typeof withApp>>
  beforeAll(async () => {
    ctx = await withApp({ corsOrigins: [ORIGIN] })
  }, 120_000)
  afterAll(async () => {
    await ctx?.stop()
  })

  it('answers a malformed preflight in problem+json, not text/plain', async () => {
    const res = await ctx.app.inject({ method: 'OPTIONS', url: '/api/v1/auth/login' })
    expect(res.statusCode).toBe(400)
    expect(res.headers['content-type']).toContain('application/problem+json')
    expect(res.json()).toMatchObject({ status: 400, title: 'Bad Request' })
  })

  it('leaves an ordinary response alone', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/health' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('application/json')
    expect(res.json()).toMatchObject({ status: 'ok' })
  })
})
