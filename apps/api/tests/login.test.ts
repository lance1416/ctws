import { afterEach, describe, expect, it } from 'vitest'
import { withApp } from './helpers/app'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!()
})

const headers = { 'x-ctws-client': 'web', origin: 'http://localhost:5173' }
const creds = { email: 'me@example.com', password: 'correct horse battery' }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function sessionId(setCookieHeader: unknown): string {
  const match = /ctws_session=([^;]+)/.exec(String(setCookieHeader))
  if (!match) throw new Error('no ctws_session cookie in Set-Cookie header')
  return match[1]!
}

async function appWithUser(overrides = {}) {
  const ctx = await withApp({ authRegistration: 'open', ...overrides })
  cleanups.push(ctx.stop)
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    headers,
    payload: { ...creds, timezone: 'Asia/Shanghai' },
  })
  const cookie = String(res.headers['set-cookie']).split(';')[0]!
  return { ...ctx, cookie, registerSetCookie: res.headers['set-cookie'] }
}

describe('POST /api/v1/auth/login', () => {
  it('accepts correct credentials and sets a fresh session cookie', async () => {
    const ctx = await appWithUser()
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers,
      payload: creds,
    })
    expect(res.statusCode).toBe(200)
    expect(String(res.headers['set-cookie'])).toMatch(/^ctws_session=/)
    expect(String(res.headers['set-cookie']).toLowerCase()).toContain('httponly')
    // A login must issue its own session, not reuse the one from registration.
    expect(sessionId(res.headers['set-cookie'])).not.toBe(sessionId(ctx.registerSetCookie))
  })

  it('rejects a wrong password with 401', async () => {
    const ctx = await appWithUser()
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers,
      payload: { ...creds, password: 'wrong horse battery' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('gives an identical response for unknown email and wrong password', async () => {
    const ctx = await appWithUser()
    const unknown = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers,
      payload: { email: 'nobody@example.com', password: creds.password },
    })
    const wrong = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers,
      payload: { ...creds, password: 'wrong horse battery' },
    })
    // Must not leak whether this email is registered -- compare the full
    // parsed body (same keys, same detail), not just status and title.
    expect(unknown.statusCode).toBe(wrong.statusCode)
    expect(unknown.json()).toEqual(wrong.json())
  })
})

describe('GET /api/v1/auth/me', () => {
  it('returns the current user and their workspace', async () => {
    const ctx = await appWithUser()
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { ...headers, cookie: ctx.cookie },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ email: creds.email, timezone: 'Asia/Shanghai' })
    expect(res.json().workspaceId).toMatch(UUID)
  })

  it('returns 401 without a cookie', async () => {
    const ctx = await appWithUser()
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers })
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 for a garbage cookie value', async () => {
    const ctx = await appWithUser()
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { ...headers, cookie: 'ctws_session=not-a-uuid' },
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('POST /api/v1/auth/logout', () => {
  // Review Focus #4 -- the session must be invalidated immediately on logout.
  it('invalidates the session it was called with', async () => {
    const ctx = await appWithUser()
    const authed = { ...headers, cookie: ctx.cookie }

    expect(
      (await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: authed })).statusCode,
    ).toBe(200)

    await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: authed })

    expect(
      (await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: authed })).statusCode,
    ).toBe(401)
  })

  it('clears the cookie', async () => {
    const ctx = await appWithUser()
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { ...headers, cookie: ctx.cookie },
    })
    const setCookie = String(res.headers['set-cookie'])
    // An empty value AND Max-Age=0 together only ever hold for a cookie
    // being cleared -- a cookie being *set* (e.g. on login) carries a real
    // session id and, at most, a future Expires, never both of these.
    expect(setCookie).toMatch(/ctws_session=;/)
    expect(setCookie).toMatch(/Max-Age=0/i)
  })

  it('is idempotent without a session', async () => {
    const ctx = await appWithUser()
    const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers })
    expect(res.statusCode).toBe(204)
  })
})
