import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { appWithUser, createProject, type TaskCtx } from './helpers/tasks'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!()
})

const headers = { 'x-ctws-client': 'web' }

async function setup(email?: string): Promise<TaskCtx> {
  const ctx = await appWithUser(email)
  cleanups.push(ctx.stop)
  return ctx
}

// Registration creates the workspace's inbox, so a fresh workspace is not empty; these tests are
// about ordinary projects.
type Listed = { id: string; isInbox: boolean }
const ordinary = (body: { projects: Listed[] }) => body.projects.filter((p) => !p.isInbox)

describe('projects', () => {
  it('starts with only the inbox', async () => {
    const ctx = await setup()
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/projects',
      headers: ctx.authed,
    })
    expect(res.statusCode).toBe(200)
    const list = (res.json() as { projects: Listed[] }).projects
    expect(list).toHaveLength(1)
    expect(list[0]!.isInbox).toBe(true)
  })

  it('creates a project and lists it', async () => {
    const ctx = await setup()
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: ctx.authed,
      payload: { name: 'CTWS' },
    })
    expect(created.statusCode).toBe(201)
    expect(created.json()).toMatchObject({ name: 'CTWS' })
    expect(created.json().id).toMatch(/^[0-9a-f-]{36}$/)

    const list = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/projects',
      headers: ctx.authed,
    })
    expect(ordinary(list.json())).toHaveLength(1)
  })

  it('appends new projects to the end', async () => {
    const ctx = await setup()
    const ids = [
      await createProject(ctx, 'one'),
      await createProject(ctx, 'two'),
      await createProject(ctx, 'three'),
    ]
    const list = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/projects',
      headers: ctx.authed,
    })
    expect(ordinary(list.json()).map((p) => p.id)).toEqual(ids)
  })

  it('rejects a client-supplied rank', async () => {
    const ctx = await setup()
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: ctx.authed,
      payload: { name: 'x', rank: 'a0' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('requires authentication', async () => {
    const ctx = await setup()
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/projects', headers })
    expect(res.statusCode).toBe(401)
  })

  it('renames a project', async () => {
    const ctx = await setup()
    const id = await createProject(ctx, 'old')
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${id}`,
      headers: ctx.authed,
      payload: { name: 'new' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().name).toBe('new')
  })

  it('soft-deletes: the row survives but the project stops being listed', async () => {
    const ctx = await setup()
    const id = await createProject(ctx, 'gone')
    expect(
      (
        await ctx.app.inject({
          method: 'DELETE',
          url: `/api/v1/projects/${id}`,
          headers: ctx.authed,
        })
      ).statusCode,
    ).toBe(204)

    const list = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/projects',
      headers: ctx.authed,
    })
    expect(ordinary(list.json())).toEqual([])
    // Spec 5.4: hard deletion would leave the event log pointing at nothing.
    const rows = await ctx.db.execute(sql`select deleted_at from projects where id = ${id}`)
    expect((rows.rows as { deleted_at: unknown }[])[0]!.deleted_at).not.toBeNull()
  })

  it('a soft-deleted project is gone even with archived=true, and cannot be patched', async () => {
    const ctx = await setup()
    const id = await createProject(ctx, 'gone')
    await ctx.app.inject({ method: 'DELETE', url: `/api/v1/projects/${id}`, headers: ctx.authed })
    const list = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/projects?archived=true',
      headers: ctx.authed,
    })
    expect(list.json().projects).toEqual([])
    const patch = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${id}`,
      headers: ctx.authed,
      payload: { name: 'zombie' },
    })
    expect(patch.statusCode).toBe(404)
  })

  it('archived projects are excluded unless asked for', async () => {
    const ctx = await setup()
    const id = await createProject(ctx, 'done')
    await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${id}`,
      headers: ctx.authed,
      payload: { archived: true },
    })
    const plain = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/projects',
      headers: ctx.authed,
    })
    expect(ordinary(plain.json())).toEqual([])
    const withArchived = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/projects?archived=true',
      headers: ctx.authed,
    })
    expect(withArchived.json().projects).toHaveLength(1)
  })

  // Workspace scoping lives in the service layer (spec 10.5). Another user's project must be
  // invisible and unmodifiable, and must read as 404 rather than 403 so its existence is not
  // disclosed.
  it('cannot see or touch another workspace projects', async () => {
    const a = await setup()
    const aId = await createProject(a, 'mine')

    const second = await a.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers,
      payload: { email: 'other@example.com', password: 'correct horse battery', timezone: 'UTC' },
    })
    const bCookie = String(second.headers['set-cookie']).split(';')[0]!
    const bAuthed = { ...headers, cookie: bCookie }

    // The full list, not `ordinary()`: that filter would hide an inbox leaked from workspace A.
    // B sees exactly its own inbox and nothing of A's.
    const bWorkspaceId = (
      await a.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: bAuthed })
    ).json().workspaceId as string
    const bList = (
      await a.app.inject({ method: 'GET', url: '/api/v1/projects', headers: bAuthed })
    ).json().projects as (Listed & { workspaceId: string })[]
    expect(bList).toHaveLength(1)
    expect(bList[0]!.isInbox).toBe(true)
    expect(bList[0]!.workspaceId).toBe(bWorkspaceId)

    for (const [method, payload] of [
      ['PATCH', { name: 'stolen' }],
      ['DELETE', undefined],
    ] as const) {
      const res = await a.app.inject({
        method,
        url: `/api/v1/projects/${aId}`,
        headers: bAuthed,
        ...(payload ? { payload } : {}),
      })
      expect(res.statusCode, method).toBe(404)
    }
  })
})
