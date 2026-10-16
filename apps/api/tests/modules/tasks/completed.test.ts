import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { appWithUser, createProject, createTask } from '../../helpers/harness'

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
async function body(ctx: Ctx): Promise<{ tasks: Row[]; truncated: boolean }> {
  const res = await ctx.app.inject({
    method: 'GET',
    url: '/api/v1/tasks?view=completed',
    headers: ctx.authed,
  })
  expect(res.statusCode).toBe(200)
  return res.json() as { tasks: Row[]; truncated: boolean }
}

const completed = async (ctx: Ctx): Promise<Row[]> => (await body(ctx)).tasks

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
      url: '/api/v1/tasks?view=completed',
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
      url: '/api/v1/tasks?view=completed',
      headers: other,
    })
    expect(res.json().tasks).toEqual([])
    expect(await completed(ctx)).toHaveLength(1)
  })
})

/**
 * WHETHER THIS IS ALL OF IT.
 *
 * The list is capped: it answers "what did I do lately", and the archive is the weekly review,
 * which takes any window. `truncated` is the server saying so, instead of the page counting rows
 * against a limit written on the client -- which lies when exactly the limit has been finished
 * and goes quiet the day the limit changes.
 */
describe('the finished list says whether it is complete', () => {
  it('reports truncated only once there is more than it returns', async () => {
    const ctx = await setup()
    const pid = await createProject(ctx, 'P')
    // One under the cap: a full page that happens to be the whole history is NOT truncated.
    await ctx.db.execute(sql`
      insert into tasks (id, workspace_id, project_id, title, status, rank, completed_at)
      select gen_random_uuid(), p.workspace_id, p.id, 't' || g, 'done', 'a' || g,
        now() - (g || ' minutes')::interval
      from generate_series(1, 200) g join projects p on p.id = ${pid}
    `)
    const full = await body(ctx)
    expect(full.tasks).toHaveLength(200)
    expect(full.truncated).toBe(false)

    // One more, and the answer says there is more than it shows.
    await ctx.db.execute(sql`
      insert into tasks (id, workspace_id, project_id, title, status, rank, completed_at)
      select gen_random_uuid(), workspace_id, id, 'one more', 'done', 'b',
        now() - interval '500 minutes'
      from projects where id = ${pid}
    `)
    const capped = await body(ctx)
    expect(capped.tasks).toHaveLength(200)
    expect(capped.truncated).toBe(true)
    // The cap drops the OLDEST, so the extra row is the one missing.
    expect(capped.tasks.map((t) => t.title)).not.toContain('one more')
  })
})
