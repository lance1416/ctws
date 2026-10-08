import type { ReviewResponse } from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { appWithUser, createProject, createTask, type TaskCtx } from './helpers/tasks'

/**
 * THE WEEKLY REVIEW reads the EVENT LOG, which is the whole difference between it and 已完成.
 * 已完成 lists what is finished right now; this lists what happened in a window. The cases below
 * are the ones where the two give different answers -- if they always agreed, one of them would
 * not need to exist.
 */

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

async function setup(timezone?: string): Promise<TaskCtx> {
  const ctx = await appWithUser()
  cleanups.push(ctx.stop)
  if (timezone) await ctx.db.execute(sql`update users set timezone = ${timezone}`)
  return ctx
}

const setStatus = (ctx: TaskCtx, id: string, status: string) =>
  ctx.app.inject({
    method: 'PATCH',
    url: `/api/v1/tasks/${id}`,
    headers: { ...ctx.authed, 'x-ctws-client': 'web' },
    payload: { status },
  })

async function review(ctx: TaskCtx, query = ''): Promise<ReviewResponse> {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/api/v1/tasks/review${query}`,
    headers: ctx.authed,
  })
  expect(res.statusCode).toBe(200)
  return res.json() as ReviewResponse
}

/** Pushes every event logged so far back by `days`, so a window can be made to exclude them. */
const backdate = (ctx: TaskCtx, days: number) =>
  ctx.db.execute(sql`update task_events set occurred_at = now() - make_interval(days => ${days})`)

describe('the weekly review', () => {
  it('groups what happened by project, split by what happened', async () => {
    const ctx = await setup()
    const pid = await createProject(ctx, '改版')
    const done = await createTask(ctx, pid, '写迁移')
    const doing = await createTask(ctx, pid, '配色重做')
    const gone = await createTask(ctx, pid, '再开一次会')
    await setStatus(ctx, done, 'done')
    await setStatus(ctx, doing, 'in_progress')
    await setStatus(ctx, gone, 'cancelled')

    const body = await review(ctx)
    const project = body.projects.find((p) => p.projectName === '改版')!
    expect(project.finished.map((t) => t.title)).toEqual(['写迁移'])
    expect(project.started.map((t) => t.title)).toEqual(['配色重做'])
    expect(project.dropped.map((t) => t.title)).toEqual(['再开一次会'])
  })

  it('reports a task that was finished and then reopened, which 已完成 cannot', async () => {
    // THE CASE THAT JUSTIFIES THE VIEW. Finishing something on Tuesday is work done, even if it
    // came back on Thursday; a recount that hides it is the kind of report nobody opens twice.
    const ctx = await setup()
    const pid = await createProject(ctx, '改版')
    const id = await createTask(ctx, pid, '写迁移')
    await setStatus(ctx, id, 'done')
    await setStatus(ctx, id, 'todo')

    const body = await review(ctx)
    expect(body.projects[0]!.finished.map((t) => t.title)).toEqual(['写迁移'])
    // While the task itself is plainly not finished.
    const completed = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/tasks/completed',
      headers: ctx.authed,
    })
    expect((completed.json() as { tasks: unknown[] }).tasks).toEqual([])
  })

  it('counts a task once per list however often it moved', async () => {
    const ctx = await setup()
    const pid = await createProject(ctx, '改版')
    const id = await createTask(ctx, pid, '配色重做')
    for (const s of ['in_progress', 'todo', 'in_progress', 'todo', 'in_progress']) {
      await setStatus(ctx, id, s)
    }
    const body = await review(ctx)
    // Starting one thing three times is one thing started, not three.
    expect(body.projects[0]!.started).toHaveLength(1)
  })

  it('leaves out what happened before the window', async () => {
    const ctx = await setup()
    const pid = await createProject(ctx, '改版')
    const old = await createTask(ctx, pid, '上周做完的')
    await setStatus(ctx, old, 'done')
    await backdate(ctx, 30)
    const fresh = await createTask(ctx, pid, '这周做完的')
    await setStatus(ctx, fresh, 'done')

    const body = await review(ctx)
    expect(body.projects[0]!.finished.map((t) => t.title)).toEqual(['这周做完的'])
  })

  it('takes an explicit window, inclusive at both ends', async () => {
    const ctx = await setup()
    const pid = await createProject(ctx, '改版')
    const id = await createTask(ctx, pid, '写迁移')
    await setStatus(ctx, id, 'done')
    await backdate(ctx, 10)

    const day = await ctx.db.execute(
      sql`select ((now() - interval '10 days') at time zone 'UTC')::date::text as d`,
    )
    const d = (day.rows[0] as { d: string }).d
    // The far end is INCLUSIVE: a window of one day contains that whole day.
    expect((await review(ctx, `?from=${d}&to=${d}`)).projects).toHaveLength(1)
    expect((await review(ctx, `?from=${d}&to=${d}`)).from).toBe(d)
    // And a window that ends the day before does not.
    const before = await ctx.db.execute(
      sql`select ((now() - interval '11 days') at time zone 'UTC')::date::text as d`,
    )
    const b = (before.rows[0] as { d: string }).d
    expect((await review(ctx, `?from=${b}&to=${b}`)).projects).toEqual([])
  })

  it('reports the window even when nothing happened in it', async () => {
    const ctx = await setup()
    const body = await review(ctx)
    expect(body.projects).toEqual([])
    // A week with nothing in it still has a heading, so the bounds are not derived from the rows.
    expect(body.from).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(body.to).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('starts the default window on Monday in the ACCOUNT zone', async () => {
    const ctx = await setup('Pacific/Kiritimati')
    const body = await review(ctx)
    const monday = await ctx.db.execute(
      sql`select date_trunc('week', now() at time zone 'Pacific/Kiritimati')::date::text as d`,
    )
    expect(body.from).toBe((monday.rows[0] as { d: string }).d)
  })

  it('leaves out a deleted task, and another workspace entirely', async () => {
    const ctx = await setup()
    const pid = await createProject(ctx, '改版')
    const gone = await createTask(ctx, pid, '删掉的')
    const kept = await createTask(ctx, pid, '留下的')
    await setStatus(ctx, gone, 'done')
    await setStatus(ctx, kept, 'done')
    await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/tasks/${gone}`,
      headers: { ...ctx.authed, 'x-ctws-client': 'web' },
    })

    // THE SECOND USER IS REGISTERED ON THE SAME APP, which the helper's own note insists on:
    // `appWithUser` boots its own Postgres, so two of them are two unrelated databases and an
    // isolation test built that way passes trivially. It did -- a mutation that dropped the
    // `workspace_id` filter entirely was caught by nothing until this was rewritten.
    const other = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'x-ctws-client': 'web' },
      payload: { email: 'other@example.com', password: 'correct horse battery', timezone: 'UTC' },
    })
    const theirs: TaskCtx = {
      ...ctx,
      authed: {
        'x-ctws-client': 'web',
        cookie: String(other.headers['set-cookie']).split(';')[0]!,
      },
    }
    const theirPid = await createProject(theirs, '别人的')
    const theirTask = await createTask(theirs, theirPid, '别人做完的')
    await setStatus(theirs, theirTask, 'done')
    // Their own review really does see it, so the absence below is scoping and not a no-op.
    const theirBody = await review(theirs)
    expect(theirBody.projects.map((p) => p.projectName)).toEqual(['别人的'])

    const body = await review(ctx)
    // The deleted task's history stays in the log (§5.4); it just is not part of the recount.
    expect(body.projects[0]!.finished.map((t) => t.title)).toEqual(['留下的'])
    expect(body.projects.map((p) => p.projectName)).toEqual(['改版'])
  })
})
