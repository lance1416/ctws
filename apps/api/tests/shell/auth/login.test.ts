import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { withApp } from '../../helpers/app'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!()
})

const headers = { 'x-ctws-client': 'web' }
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

  // ONE TEST FOR BOTH REFUSALS, because the point is that they are INDISTINGUISHABLE: a wrong
  // password and an address nobody registered have to answer the same thing, or the difference
  // between them is a way to ask whether an address has an account here. Asserting 401 on one of
  // them separately proves a strictly weaker claim than asserting both are equal.
  it('refuses a wrong password and an unknown address identically', async () => {
    const ctx = await appWithUser()
    const login = (payload: Record<string, string>) =>
      ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', headers, payload })

    const wrong = await login({ ...creds, password: 'wrong horse battery' })
    const unknown = await login({ email: 'nobody@example.com', password: creds.password })

    expect(wrong.statusCode).toBe(401)
    expect(unknown.statusCode).toBe(401)
    // The whole parsed body, not just status and title: a `detail` that named which half was
    // wrong would leak exactly what the equal status codes are hiding.
    expect(unknown.json()).toEqual(wrong.json())
    expect(unknown.headers['set-cookie'], 'a refusal must not set a session').toBeUndefined()
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

  // Every way of arriving without a usable session, in one table: no cookie at all, a value that
  // is not a token, and one that is the right SHAPE but names nothing. The third is the case a
  // hashed lookup could get wrong by reaching the database with a malformed parameter.
  it.each([
    ['no cookie', undefined],
    ['a value that is not a token', 'ctws_session=not-a-uuid'],
    ['a well-formed token nobody holds', `ctws_session=${'a'.repeat(43)}`],
  ])('answers 401 to %s', async (_what, cookie) => {
    const ctx = await appWithUser()
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: cookie ? { ...headers, cookie } : headers,
    })
    expect(res.statusCode).toBe(401)
    expect(res.headers['content-type']).toContain('application/problem+json')
  })

  it('renews the cookie when it renews the session, so daily use never signs out', async () => {
    const ctx = await appWithUser()
    // Last seen two hours ago: old enough for this request to renew the session.
    await ctx.db.execute(sql`update sessions set last_seen_at = now() - interval '2 hours'`)
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { ...headers, cookie: ctx.cookie },
    })
    expect(res.statusCode).toBe(200)
    expect(sessionId(res.headers['set-cookie'])).toBe(ctx.cookie.split('=')[1])
    const expires = /Expires=([^;]+)/.exec(String(res.headers['set-cookie']))?.[1]
    const [row] = (await ctx.db.execute(sql`select expires_at from sessions`)).rows as {
      expires_at: string
    }[]
    expect(new Date(expires!).getTime()).toBe(
      Math.floor(new Date(row!.expires_at).getTime() / 1000) * 1000,
    )
  })

  it('does not reissue the cookie on a request that renews nothing', async () => {
    const ctx = await appWithUser()
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { ...headers, cookie: ctx.cookie },
    })
    expect(res.headers['set-cookie']).toBeUndefined()
  })
})

describe('POST /api/v1/auth/logout', () => {
  // The session must be invalidated immediately on logout.
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
