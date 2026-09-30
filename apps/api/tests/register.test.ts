import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { withApp } from './helpers/app'

async function app(overrides = {}) {
  const ctx = await withApp(overrides)
  cleanups.push(ctx.stop)
  return ctx
}
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!()
})

const body = { email: 'new@example.com', password: 'correct horse battery', timezone: 'UTC' }
const headers = { 'x-ctws-client': 'web', origin: 'http://localhost:5173' }

describe('POST /api/v1/auth/register', () => {
  it('creates a user, a workspace and a membership', async () => {
    const ctx = await app()
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers,
      payload: body,
    })

    expect(res.statusCode).toBe(201)
    expect(res.json()).toMatchObject({ email: 'new@example.com', timezone: 'UTC' })

    const members = await ctx.db.execute(sql`select count(*)::int as n from workspace_members`)
    expect((members.rows as { n: number }[])[0]!.n).toBe(1)
  })

  it('sets a session cookie on success', async () => {
    const ctx = await app()
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers,
      payload: body,
    })
    expect(res.headers['set-cookie']).toBeDefined()

    // The cookie must be a usable session, not merely present.
    const cookie = String(res.headers['set-cookie']).split(';')[0]!
    const me = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie },
    })
    expect(me.statusCode).toBe(200)
    expect(me.json()).toMatchObject({ email: 'new@example.com' })
  })

  // Review Focus #5 -- a duplicate email must be 409, not 500
  it('returns 409 for a duplicate email', async () => {
    const ctx = await app()
    const first = { method: 'POST' as const, url: '/api/v1/auth/register', headers, payload: body }
    await ctx.app.inject(first)
    const res = await ctx.app.inject(first)

    expect(res.statusCode).toBe(409)
    expect(res.headers['content-type']).toContain('application/problem+json')
  })

  // Review Focus #5 -- a failure must not leave orphan data behind
  it('leaves no orphan workspace when the email is taken', async () => {
    const ctx = await app()
    const req = { method: 'POST' as const, url: '/api/v1/auth/register', headers, payload: body }
    await ctx.app.inject(req)
    await ctx.app.inject(req)

    const rows = await ctx.db.execute(sql`select count(*)::int as n from workspaces`)
    expect((rows.rows as { n: number }[])[0]!.n).toBe(1)
  })

  // Review Focus #3 -- an invalid timezone must also be rejected at the endpoint layer
  it('returns 400 for an invalid timezone', async () => {
    const ctx = await app()
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers,
      payload: { ...body, timezone: 'GMT+8' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('never returns the password hash', async () => {
    const ctx = await app()
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers,
      payload: body,
    })
    expect(Object.keys(res.json()).sort()).toEqual(['email', 'id', 'timezone', 'workspaceId'])
  })
})

describe('registration gating', () => {
  it('returns 403 when registration is closed', async () => {
    const ctx = await app({ authRegistration: 'closed' })
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers,
      payload: body,
    })
    expect(res.statusCode).toBe(403)
  })

  it('requires a matching invite code when invite-only', async () => {
    const ctx = await app({ authRegistration: 'invite', authInviteCode: 'let-me-in' })
    const bad = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers,
      payload: { ...body, inviteCode: 'wrong' },
    })
    expect(bad.statusCode).toBe(403)

    const good = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers,
      payload: { ...body, inviteCode: 'let-me-in' },
    })
    expect(good.statusCode).toBe(201)
  })
})
