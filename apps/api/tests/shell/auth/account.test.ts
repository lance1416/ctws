import { afterEach, describe, expect, it } from 'vitest'
import { appWithUser, type Harness } from '../../helpers/harness'

/**
 * THE ACCOUNT'S OWN SETTINGS (artboard 30): the zone every day is counted in, and the password.
 * A new password needs the current one, and signs the account out everywhere else.
 */

const NOW = new Date('2026-10-28T10:24:00Z')
const PASSWORD = 'correct horse battery'
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

async function setup(): Promise<Harness> {
  const ctx = await appWithUser('me@example.com', { timezone: 'Europe/London', clock: () => NOW })
  cleanups.push(ctx.stop)
  return ctx
}

const me = (ctx: Harness, cookie = ctx.authed) =>
  ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: cookie })

const changePassword = (ctx: Harness, payload: object) =>
  ctx.app.inject({ method: 'POST', url: '/api/v1/auth/password', headers: ctx.authed, payload })

async function signIn(ctx: Harness, password: string) {
  return ctx.app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: { 'x-ctws-client': 'web' },
    payload: { email: 'me@example.com', password },
  })
}

describe('PATCH /auth/me', () => {
  it('changes the zone every day is counted in', async () => {
    const ctx = await setup()
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/auth/me',
      headers: ctx.authed,
      payload: { timezone: 'Asia/Shanghai' },
    })
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json()).toMatchObject({ timezone: 'Asia/Shanghai', email: 'me@example.com' })
    expect((await me(ctx)).json()).toMatchObject({ timezone: 'Asia/Shanghai' })
  })

  it('refuses a zone that is not one, and anything else', async () => {
    const ctx = await setup()
    for (const payload of [{ timezone: 'Mars/Olympus' }, { email: 'x@example.com' }]) {
      const res = await ctx.app.inject({
        method: 'PATCH',
        url: '/api/v1/auth/me',
        headers: ctx.authed,
        payload,
      })
      expect(res.statusCode, JSON.stringify(payload)).toBe(400)
    }
  })
})

describe('POST /auth/password', () => {
  it('changes it given the current one, says when, and ends the other sessions', async () => {
    const ctx = await setup()
    const elsewhere = String((await signIn(ctx, PASSWORD)).headers['set-cookie']).split(';')[0]!
    expect((await me(ctx)).json().passwordChangedAt).toBeNull()

    const res = await changePassword(ctx, { current: PASSWORD, next: 'a much longer passphrase' })
    expect(res.statusCode, res.body).toBe(204)

    expect((await me(ctx)).json().passwordChangedAt).toBe(NOW.toISOString())
    const other = await me(ctx, { 'x-ctws-client': 'web', cookie: elsewhere })
    expect(other.statusCode).toBe(401)
    expect((await signIn(ctx, PASSWORD)).statusCode).toBe(401)
    expect((await signIn(ctx, 'a much longer passphrase')).statusCode).toBe(200)
  })

  it('refuses a wrong current password by name, and changes nothing', async () => {
    const ctx = await setup()
    const res = await changePassword(ctx, {
      current: 'not it at all',
      next: 'a much longer passphrase',
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().type).toBe('urn:ctws:problem:wrong-password')
    expect((await signIn(ctx, PASSWORD)).statusCode).toBe(200)
  })

  it('refuses a new password that is too short', async () => {
    const ctx = await setup()
    expect((await changePassword(ctx, { current: PASSWORD, next: 'short' })).statusCode).toBe(400)
  })
})
