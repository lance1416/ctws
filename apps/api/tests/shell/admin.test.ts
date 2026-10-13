import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { LastAdminError } from '../../src/shell/admin/errors'
import { updateUser } from '../../src/shell/admin/service'
import { withApp } from '../helpers/app'

type Ctx = Awaited<ReturnType<typeof withApp>>

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!()
})

const headers = { 'x-ctws-client': 'web', origin: 'http://localhost:5173' }
const PASSWORD = 'correct horse battery'

async function setup() {
  const ctx = await withApp({ authRegistration: 'closed' })
  cleanups.push(ctx.stop)
  // Closed registration still admits the first user, who becomes admin.
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    headers,
    payload: { email: 'admin@example.com', password: PASSWORD, timezone: 'UTC' },
  })
  expect(res.statusCode).toBe(201)
  return { ctx, admin: { id: res.json().id as string, cookie: cookieOf(res) } }
}

function cookieOf(res: { headers: Record<string, unknown> }): string {
  return String(res.headers['set-cookie']).split(';')[0]!
}

const call = (
  ctx: Ctx,
  cookie: string | undefined,
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  payload?: object,
) =>
  ctx.app.inject({
    method,
    url: `/api/v1${url}`,
    headers: { ...headers, ...(cookie ? { cookie } : {}) },
    ...(payload ? { payload } : {}),
  })

async function login(ctx: Ctx, email: string): Promise<string> {
  const res = await call(ctx, undefined, 'POST', '/auth/login', { email, password: PASSWORD })
  expect(res.statusCode).toBe(200)
  return cookieOf(res)
}

// Creates a user through the admin API and logs them in.
async function createUser(ctx: Ctx, adminCookie: string, email: string, role: string) {
  const res = await call(ctx, adminCookie, 'POST', '/admin/users', {
    email,
    password: PASSWORD,
    timezone: 'UTC',
    role,
  })
  expect(res.statusCode).toBe(201)
  return { id: res.json().id as string, cookie: await login(ctx, email) }
}

const enabledAdmins = async (ctx: Ctx) =>
  (
    (
      await ctx.db.execute(sql`select count(*)::int as n from users
      where role = 'admin' and disabled_at is null`)
    ).rows as { n: number }[]
  )[0]!.n

describe('admin endpoint access', () => {
  const endpoints = [
    ['GET', '/admin/users', undefined],
    [
      'POST',
      '/admin/users',
      { email: 'x@example.com', password: PASSWORD, timezone: 'UTC', role: 'member' },
    ],
    ['PATCH', '/admin/users/01931b9c-5d7e-7c3a-8f2e-1a2b3c4d5e6f', { disabled: true }],
  ] as const

  it.each(endpoints)('%s %s requires authentication', async (method, url, payload) => {
    const { ctx } = await setup()
    expect((await call(ctx, undefined, method, url, payload)).statusCode).toBe(401)
  })

  it.each(endpoints)('%s %s returns 403 to a member', async (method, url, payload) => {
    const { ctx, admin } = await setup()
    const member = await createUser(ctx, admin.cookie, 'm@example.com', 'member')
    const res = await call(ctx, member.cookie, method, url, payload)
    expect(res.statusCode).toBe(403)
    expect(res.headers['content-type']).toContain('application/problem+json')
  })

  // Pins the current boundary: `maintainer` exists but unlocks nothing yet (see auth/roles.ts).
  // If this test changes, a maintainer capability is being added -- make that deliberate.
  it.each(endpoints)('%s %s returns 403 to a maintainer', async (method, url, payload) => {
    const { ctx, admin } = await setup()
    const maintainer = await createUser(ctx, admin.cookie, 'mt@example.com', 'maintainer')
    const res = await call(ctx, maintainer.cookie, method, url, payload)
    expect(res.statusCode).toBe(403)
    expect(res.headers['content-type']).toContain('application/problem+json')
  })

  it('applies a demotion on the very next request, without waiting for the session to expire', async () => {
    const { ctx, admin } = await setup()
    const second = await createUser(ctx, admin.cookie, 'second@example.com', 'admin')
    expect((await call(ctx, second.cookie, 'GET', '/admin/users')).statusCode).toBe(200)

    const demote = await call(ctx, admin.cookie, 'PATCH', `/admin/users/${second.id}`, {
      role: 'member',
    })
    expect(demote.statusCode).toBe(200)
    expect((await call(ctx, second.cookie, 'GET', '/admin/users')).statusCode).toBe(403)
  })
})

describe('GET /admin/users', () => {
  it('lists users with their role and disabled state, and never the password hash', async () => {
    const { ctx, admin } = await setup()
    await createUser(ctx, admin.cookie, 'm@example.com', 'member')

    const res = await call(ctx, admin.cookie, 'GET', '/admin/users')
    expect(res.statusCode).toBe(200)
    const { users } = res.json() as { users: Record<string, unknown>[] }
    expect(users.map((u) => u.email)).toEqual(['admin@example.com', 'm@example.com'])
    expect(users.map((u) => u.role)).toEqual(['admin', 'member'])
    for (const u of users) {
      expect(Object.keys(u).sort()).toEqual(['createdAt', 'disabledAt', 'email', 'id', 'role'])
      expect(u.disabledAt).toBeNull()
    }

    // Assert on the serialized body, not the parsed object.
    const hashes = (await ctx.db.execute(sql`select password_hash from users`)).rows as {
      password_hash: string
    }[]
    expect(hashes).toHaveLength(2)
    for (const { password_hash } of hashes) expect(res.body).not.toContain(password_hash)
    expect(res.body.toLowerCase()).not.toContain('password')
    expect(res.body).not.toContain('argon2')
  })
})

describe('POST /admin/users', () => {
  it('creates the user, workspace and membership together, with the given role', async () => {
    const { ctx, admin } = await setup()
    const res = await call(ctx, admin.cookie, 'POST', '/admin/users', {
      email: 'new@example.com',
      password: PASSWORD,
      timezone: 'Asia/Shanghai',
      role: 'maintainer',
    })
    expect(res.statusCode).toBe(201)
    expect(res.json()).toMatchObject({
      email: 'new@example.com',
      role: 'maintainer',
      disabledAt: null,
    })
    expect(res.body).not.toContain('argon2')

    const members = await ctx.db.execute(sql`
      select wm.role from workspace_members wm join users u on u.id = wm.user_id
      where u.email = 'new@example.com'`)
    expect(members.rows).toEqual([{ role: 'owner' }])

    // The new user can log in, and the role they were given is what /auth/me reports.
    const cookie = await login(ctx, 'new@example.com')
    const me = await call(ctx, cookie, 'GET', '/auth/me')
    expect(me.json()).toMatchObject({ role: 'maintainer' })
  })

  it('returns 409 for a duplicate email and leaves no orphan workspace', async () => {
    const { ctx, admin } = await setup()
    const payload = {
      email: 'admin@example.com',
      password: PASSWORD,
      timezone: 'UTC',
      role: 'member',
    }
    const res = await call(ctx, admin.cookie, 'POST', '/admin/users', payload)
    expect(res.statusCode).toBe(409)
    expect(res.headers['content-type']).toContain('application/problem+json')

    const rows = await ctx.db.execute(sql`select count(*)::int as n from workspaces`)
    expect((rows.rows as { n: number }[])[0]!.n).toBe(1)
  })

  it('rejects a missing or unknown role with 400', async () => {
    const { ctx, admin } = await setup()
    const base = { email: 'x@example.com', password: PASSWORD, timezone: 'UTC' }
    expect((await call(ctx, admin.cookie, 'POST', '/admin/users', base)).statusCode).toBe(400)
    expect(
      (await call(ctx, admin.cookie, 'POST', '/admin/users', { ...base, role: 'root' })).statusCode,
    ).toBe(400)
  })
})

describe('PATCH /admin/users/:id', () => {
  it('changes a role', async () => {
    const { ctx, admin } = await setup()
    const m = await createUser(ctx, admin.cookie, 'm@example.com', 'member')
    const res = await call(ctx, admin.cookie, 'PATCH', `/admin/users/${m.id}`, {
      role: 'maintainer',
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ id: m.id, role: 'maintainer' })
  })

  it('returns 404 for an unknown user and 400 for an empty patch', async () => {
    const { ctx, admin } = await setup()
    const missing = '01931b9c-5d7e-7c3a-8f2e-1a2b3c4d5e6f'
    expect(
      (await call(ctx, admin.cookie, 'PATCH', `/admin/users/${missing}`, { disabled: true }))
        .statusCode,
    ).toBe(404)
    expect(
      (await call(ctx, admin.cookie, 'PATCH', `/admin/users/${admin.id}`, {})).statusCode,
    ).toBe(400)
  })

  // Invariant (b): a disabled user's existing session must stop working immediately.
  it('disabling a user revokes their sessions and a valid session stops working at once', async () => {
    const { ctx, admin } = await setup()
    const m = await createUser(ctx, admin.cookie, 'm@example.com', 'member')
    expect((await call(ctx, m.cookie, 'GET', '/auth/me')).statusCode).toBe(200)

    const res = await call(ctx, admin.cookie, 'PATCH', `/admin/users/${m.id}`, { disabled: true })
    expect(res.statusCode).toBe(200)
    expect(res.json().disabledAt).toEqual(expect.any(String))

    const left = await ctx.db.execute(sql`select 1 from sessions where user_id = ${m.id}`)
    expect(left.rows).toHaveLength(0)
    expect((await call(ctx, m.cookie, 'GET', '/auth/me')).statusCode).toBe(401)
  })

  // Separate from the revocation above: even if a session row survives (e.g. one created some
  // other way), requireUser itself must refuse a disabled user.
  it('rejects a still-valid session whose user is disabled', async () => {
    const { ctx, admin } = await setup()
    const m = await createUser(ctx, admin.cookie, 'm@example.com', 'member')
    await ctx.db.execute(sql`update users set disabled_at = now() where id = ${m.id}`)

    const sessionRows = await ctx.db.execute(sql`select 1 from sessions where user_id = ${m.id}`)
    expect(sessionRows.rows).toHaveLength(1)
    expect((await call(ctx, m.cookie, 'GET', '/auth/me')).statusCode).toBe(401)
  })

  it('refuses login for a disabled user and allows it again once re-enabled', async () => {
    const { ctx, admin } = await setup()
    const m = await createUser(ctx, admin.cookie, 'm@example.com', 'member')
    await call(ctx, admin.cookie, 'PATCH', `/admin/users/${m.id}`, { disabled: true })

    const denied = await call(ctx, undefined, 'POST', '/auth/login', {
      email: 'm@example.com',
      password: PASSWORD,
    })
    expect(denied.statusCode).toBe(401)
    expect(denied.headers['set-cookie']).toBeUndefined()

    const res = await call(ctx, admin.cookie, 'PATCH', `/admin/users/${m.id}`, { disabled: false })
    expect(res.json().disabledAt).toBeNull()
    await login(ctx, 'm@example.com')
  })
})

describe('last enabled admin', () => {
  // Invariant (a): an admin must not be able to lock the instance out.
  it('cannot be disabled', async () => {
    const { ctx, admin } = await setup()
    const res = await call(ctx, admin.cookie, 'PATCH', `/admin/users/${admin.id}`, {
      disabled: true,
    })
    expect(res.statusCode).toBe(409)
    expect(res.headers['content-type']).toContain('application/problem+json')
    expect(await enabledAdmins(ctx)).toBe(1)
    // The rolled-back transaction must also have kept the session.
    expect((await call(ctx, admin.cookie, 'GET', '/auth/me')).statusCode).toBe(200)
  })

  it('cannot be demoted', async () => {
    const { ctx, admin } = await setup()
    const res = await call(ctx, admin.cookie, 'PATCH', `/admin/users/${admin.id}`, {
      role: 'member',
    })
    expect(res.statusCode).toBe(409)
    expect(await enabledAdmins(ctx)).toBe(1)
  })

  it('does not count a disabled admin as the remaining admin', async () => {
    const { ctx, admin } = await setup()
    const second = await createUser(ctx, admin.cookie, 'second@example.com', 'admin')
    await call(ctx, admin.cookie, 'PATCH', `/admin/users/${second.id}`, { disabled: true })
    const res = await call(ctx, admin.cookie, 'PATCH', `/admin/users/${admin.id}`, {
      role: 'member',
    })
    expect(res.statusCode).toBe(409)
  })

  it('may be demoted or disabled once another enabled admin exists', async () => {
    const { ctx, admin } = await setup()
    await createUser(ctx, admin.cookie, 'second@example.com', 'admin')
    const res = await call(ctx, admin.cookie, 'PATCH', `/admin/users/${admin.id}`, {
      role: 'member',
    })
    expect(res.statusCode).toBe(200)
    expect(await enabledAdmins(ctx)).toBe(1)
  })

  // Calls the service directly: over HTTP the second request's guard usually runs after the first
  // commit and is refused with 403, which would never exercise the race.
  it('survives two admins demoting each other at the same time', async () => {
    const { ctx, admin } = await setup()
    const second = await createUser(ctx, admin.cookie, 'second@example.com', 'admin')
    // Repeated because the interleaving is timing dependent; without the admin-set lock some
    // round ends with both demotions committed and no admin left.
    for (let round = 0; round < 15; round++) {
      await ctx.db.execute(
        sql`update users set role = 'admin' where id in (${admin.id}, ${second.id})`,
      )
      const results = await Promise.allSettled([
        updateUser(ctx.db, second.id, { role: 'member' }),
        updateUser(ctx.db, admin.id, { role: 'member' }),
      ])
      expect(results.map((r) => r.status).sort(), `round ${round}`).toEqual([
        'fulfilled',
        'rejected',
      ])
      expect(results.find((r) => r.status === 'rejected')).toMatchObject({
        reason: expect.any(LastAdminError),
      })
      expect(await enabledAdmins(ctx), `round ${round}`).toBe(1)
    }
  })
})
