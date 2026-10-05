import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { appWithUser, createProject, createTask } from './helpers/tasks'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

async function setup(timezone?: string) {
  const ctx = await appWithUser()
  cleanups.push(ctx.stop)
  if (timezone) await ctx.db.execute(sql`update users set timezone = ${timezone}`)
  return ctx
}
type Ctx = Awaited<ReturnType<typeof setup>>

type Row = {
  id: string
  title: string
  projectName: string
  parentTitle: string | null
  completedOn: string
  completedAt: string
}
async function completed(ctx: Ctx): Promise<Row[]> {
  const res = await ctx.app.inject({
    method: 'GET',
    url: '/api/v1/tasks/completed',
    headers: ctx.authed,
  })
  expect(res.statusCode).toBe(200)
  return res.json().tasks as Row[]
}

/** Finishes through the real API (so completed_at is set by the service), then pins the instant. */
async function finish(ctx: Ctx, id: string, at: string) {
  const res = await ctx.app.inject({
    method: 'PATCH',
    url: `/api/v1/tasks/${id}`,
    headers: ctx.authed,
    payload: { status: 'done' },
  })
  expect(res.statusCode).toBe(200)
  await ctx.db.execute(sql`update tasks set completed_at = ${at}::timestamptz where id = ${id}`)
}

describe('GET /completed', () => {
  it('requires authentication', async () => {
    const ctx = await setup()
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/tasks/completed',
      headers: { 'x-ctws-client': 'web' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('lists finished tasks across projects, newest first, with project and parent', async () => {
    const ctx = await setup('UTC')
    const a = await createProject(ctx, 'Alpha')
    const b = await createProject(ctx, 'Beta')
    const parent = await createTask(ctx, a, '父任务')
    const old = await createTask(ctx, a, 'old', parent)
    const mid = await createTask(ctx, b, 'mid')
    const fresh = await createTask(ctx, a, 'fresh')
    await createTask(ctx, a, 'still open')
    await finish(ctx, old, '2026-09-01T10:00:00Z')
    await finish(ctx, fresh, '2026-09-03T10:00:00Z')
    await finish(ctx, mid, '2026-09-02T10:00:00Z')

    const rows = await completed(ctx)
    expect(rows.map((r) => r.title)).toEqual(['fresh', 'mid', 'old'])
    expect(rows.find((r) => r.id === old)).toMatchObject({
      projectName: 'Alpha',
      parentTitle: '父任务',
      completedOn: '2026-09-01',
    })
    expect(rows.find((r) => r.id === mid)).toMatchObject({ projectName: 'Beta', parentTitle: null })
  })

  it('groups by the user timezone day, not the database day', async () => {
    // 2026-09-01T20:30Z is already 09-02 in Shanghai (+8) and still 09-01 in UTC.
    const ctx = await setup('Asia/Shanghai')
    const p = await createProject(ctx, 'p')
    const id = await createTask(ctx, p, 'late')
    await finish(ctx, id, '2026-09-01T20:30:00Z')
    expect((await completed(ctx))[0]!.completedOn).toBe('2026-09-02')
  })

  it('leaves out cancelled, reopened, deleted tasks and deleted projects', async () => {
    const ctx = await setup()
    const p = await createProject(ctx, 'p')
    const gone = await createProject(ctx, 'gone')
    const cancelled = await createTask(ctx, p, 'cancelled')
    const reopened = await createTask(ctx, p, 'reopened')
    const deleted = await createTask(ctx, p, 'deleted')
    const inDeletedProject = await createTask(ctx, gone, 'in deleted project')
    const kept = await createTask(ctx, p, 'kept')
    const patch = (id: string, status: string) =>
      ctx.app.inject({
        method: 'PATCH',
        url: `/api/v1/tasks/${id}`,
        headers: ctx.authed,
        payload: { status },
      })
    await patch(cancelled, 'cancelled')
    await patch(reopened, 'done')
    await patch(reopened, 'todo')
    await patch(deleted, 'done')
    await patch(inDeletedProject, 'done')
    await patch(kept, 'done')
    await ctx.app.inject({ method: 'DELETE', url: `/api/v1/tasks/${deleted}`, headers: ctx.authed })
    await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/${gone}`,
      headers: ctx.authed,
    })
    expect((await completed(ctx)).map((r) => r.title)).toEqual(['kept'])
  })

  it('cannot see another workspace', async () => {
    const ctx = await setup()
    const p = await createProject(ctx, 'mine')
    const id = await createTask(ctx, p, 'mine')
    await finish(ctx, id, '2026-09-01T10:00:00Z')

    // Same app, second user: a second appWithUser() would boot an unrelated database.
    const reg = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'x-ctws-client': 'web' },
      payload: { email: 'other@example.com', password: 'correct horse battery', timezone: 'UTC' },
    })
    const other = {
      'x-ctws-client': 'web',
      cookie: String(reg.headers['set-cookie']).split(';')[0]!,
    }
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/tasks/completed',
      headers: other,
    })
    expect(res.json().tasks).toEqual([])
    expect(await completed(ctx)).toHaveLength(1)
  })
})
