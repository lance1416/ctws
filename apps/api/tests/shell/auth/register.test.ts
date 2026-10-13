import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { withApp } from '../../helpers/app'

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

  // A duplicate email must be 409, not 500.
  it('returns 409 for a duplicate email', async () => {
    const ctx = await app()
    const first = { method: 'POST' as const, url: '/api/v1/auth/register', headers, payload: body }
    await ctx.app.inject(first)
    const res = await ctx.app.inject(first)

    expect(res.statusCode).toBe(409)
    expect(res.headers['content-type']).toContain('application/problem+json')
  })

  // A failure must not leave orphan data behind.
  it('leaves no orphan workspace when the email is taken', async () => {
    const ctx = await app()
    const req = { method: 'POST' as const, url: '/api/v1/auth/register', headers, payload: body }
    await ctx.app.inject(req)
    await ctx.app.inject(req)

    const rows = await ctx.db.execute(sql`select count(*)::int as n from workspaces`)
    expect((rows.rows as { n: number }[])[0]!.n).toBe(1)
  })

  // An invalid timezone must also be rejected at the endpoint layer.
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
    expect(Object.keys(res.json()).sort()).toEqual([
      'email',
      'id',
      'role',
      'timezone',
      'workspaceId',
    ])
  })
})

const post = (ctx: Awaited<ReturnType<typeof app>>, payload: object) =>
  ctx.app.inject({ method: 'POST', url: '/api/v1/auth/register', headers, payload })

const second = { ...body, email: 'second@example.com' }

describe('registration gating', () => {
  // Seeds the first account, which is always allowed; the gating below applies to everyone after.
  it('returns 403 when registration is closed and a user already exists', async () => {
    const ctx = await app({ authRegistration: 'closed' })
    expect((await post(ctx, body)).statusCode).toBe(201)
    expect((await post(ctx, second)).statusCode).toBe(403)
  })

  it('requires a matching invite code when invite-only and a user already exists', async () => {
    const ctx = await app({ authRegistration: 'invite', authInviteCode: 'let-me-in' })
    expect((await post(ctx, body)).statusCode).toBe(201)

    const bad = await post(ctx, { ...second, inviteCode: 'wrong' })
    expect(bad.statusCode).toBe(403)

    const good = await post(ctx, { ...second, inviteCode: 'let-me-in' })
    expect(good.statusCode).toBe(201)
  })
})

describe('first-user bootstrap', () => {
  it('lets the first user in when registration is closed, and makes them admin', async () => {
    const ctx = await app({ authRegistration: 'closed' })
    const res = await post(ctx, body)
    expect(res.statusCode).toBe(201)
    expect(res.json()).toMatchObject({ role: 'admin' })

    const rows = await ctx.db.execute(sql`select role from users`)
    expect(rows.rows).toEqual([{ role: 'admin' }])
  })

  it('lets the first user in when invite-only without a code', async () => {
    const ctx = await app({ authRegistration: 'invite', authInviteCode: 'let-me-in' })
    const res = await post(ctx, body)
    expect(res.statusCode).toBe(201)
    expect(res.json()).toMatchObject({ role: 'admin' })
  })

  it('refuses a second registration when closed', async () => {
    const ctx = await app({ authRegistration: 'closed' })
    await post(ctx, body)
    const res = await post(ctx, second)
    expect(res.statusCode).toBe(403)
    expect(res.headers['content-type']).toContain('application/problem+json')
  })

  it('makes a second registration a member when registration is open', async () => {
    const ctx = await app({ authRegistration: 'open' })
    expect((await post(ctx, body)).json()).toMatchObject({ role: 'admin' })
    const res = await post(ctx, second)
    expect(res.statusCode).toBe(201)
    expect(res.json()).toMatchObject({ role: 'member' })
  })

  it('reports the role on /auth/me', async () => {
    const ctx = await app({ authRegistration: 'closed' })
    const res = await post(ctx, body)
    const cookie = String(res.headers['set-cookie']).split(';')[0]!
    const me = await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie } })
    expect(me.json()).toMatchObject({ role: 'admin' })
  })

  // READ COMMITTED lets both transactions see an empty table; only the advisory lock stops two
  // first registrations from both becoming admin (closed: the loser must be refused instead).
  it.each(['open', 'closed'] as const)(
    'creates exactly one admin when two first registrations race (%s)',
    async (mode) => {
      const ctx = await app({ authRegistration: mode })
      const results = await Promise.all([
        post(ctx, { ...body, email: 'r1@example.com' }),
        post(ctx, { ...body, email: 'r2@example.com' }),
      ])
      const rows = await ctx.db.execute(sql`select role from users`)
      const roles = (rows.rows as { role: string }[]).map((r) => r.role).sort()
      expect(roles.filter((r) => r === 'admin')).toHaveLength(1)
      expect(results.map((r) => r.statusCode).sort()).toEqual(
        mode === 'open' ? [201, 201] : [201, 403],
      )
    },
  )
})
