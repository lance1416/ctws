import type { ReviewResponse } from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { appWithUser, type Harness, secondUser } from '../../helpers/harness'
import { createProject, createTask } from '../../helpers/builders'

/**
 * THE WEEKLY REVIEW reads the EVENT LOG, which is the whole difference between it and Done.
 * Done lists what is finished right now; this lists what happened in a window. The cases below
 * are the ones where the two give different answers -- if they always agreed, one of them would
 * not need to exist.
 */

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

async function setup(timezone?: string, now?: Date): Promise<Harness> {
  const ctx = await appWithUser(undefined, {
    ...(timezone ? { timezone } : {}),
    ...(now ? { clock: () => now } : {}),
  })
  cleanups.push(ctx.stop)
  return ctx
}

const setStatus = (ctx: Harness, id: string, status: string) =>
  ctx.app.inject({
    method: 'PATCH',
    url: `/api/v1/tasks/${id}`,
    headers: { ...ctx.authed, 'x-ctws-client': 'web' },
    payload: { status },
  })

async function review(ctx: Harness, query = ''): Promise<ReviewResponse> {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/api/v1/tasks?view=review${query}`,
    headers: ctx.authed,
  })
  expect(res.statusCode).toBe(200)
  return res.json() as ReviewResponse
}

/** Pushes every event logged so far back by `days`, so a window can be made to exclude them. */
const backdate = (ctx: Harness, days: number) =>
  ctx.db.execute(sql`update events set occurred_at = now() - make_interval(days => ${days})`)

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

  it('reports a task that was finished and then reopened, which Done cannot', async () => {
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
    const task = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/tasks/${id}`,
      headers: ctx.authed,
    })
    expect((task.json() as { status: string }).status).toBe('todo')
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
    expect((await review(ctx, `&from=${d}&to=${d}`)).projects).toHaveLength(1)
    expect((await review(ctx, `&from=${d}&to=${d}`)).from).toBe(d)
    // And a window that ends the day before does not.
    const before = await ctx.db.execute(
      sql`select ((now() - interval '11 days') at time zone 'UTC')::date::text as d`,
    )
    const b = (before.rows[0] as { d: string }).d
    expect((await review(ctx, `&from=${b}&to=${b}`)).projects).toEqual([])
  })

  it('refuses a start after the default end, as it refuses one after an explicit end', async () => {
    const ctx = await setup('UTC', new Date('2026-10-04T12:00:00Z'))
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/tasks?view=review&from=2027-01-01',
      headers: ctx.authed,
    })
    expect(res.statusCode, res.body).toBe(400)
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
    // Sunday noon in UTC is already Monday 02:00 in Kiritimati: a UTC week would start a week earlier.
    const ctx = await setup('Pacific/Kiritimati', new Date('2026-10-04T12:00:00Z'))
    expect((await review(ctx)).from).toBe('2026-10-05')
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

    const theirs = await secondUser(ctx)
    const theirPid = await createProject(theirs, '别人的')
    const theirTask = await createTask(theirs, theirPid, '别人做完的')
    await setStatus(theirs, theirTask, 'done')
    // Their own review really does see it, so the absence below is scoping and not a no-op.
    const theirBody = await review(theirs)
    expect(theirBody.projects.map((p) => p.projectName)).toEqual(['别人的'])

    const body = await review(ctx)
    // The deleted task's history stays in the log; it just is not part of the recount.
    expect(body.projects[0]!.finished.map((t) => t.title)).toEqual(['留下的'])
    expect(body.projects.map((p) => p.projectName)).toEqual(['改版'])
  })

  it('names the parent of each leaf, so the leaves under one parent can be told as one line', async () => {
    const ctx = await setup()
    const pid = await createProject(ctx, 'CTWS')
    const redesign = await createTask(ctx, pid, 'Redesign')
    const page = await createTask(ctx, pid, 'Draw the page list', redesign)
    const alone = await createTask(ctx, pid, 'Release v0.30.1')
    await setStatus(ctx, page, 'done')
    await setStatus(ctx, alone, 'done')

    const finished = (await review(ctx)).projects[0]!.finished
    expect(finished.find((t) => t.id === page)!.parent).toEqual({ id: redesign, title: 'Redesign' })
    expect(finished.find((t) => t.id === alone)!.parent).toBeNull()
  })
})

describe('the weeks under review', () => {
  it('counts what each week since the first change finished, newest first, empty weeks too', async () => {
    // The clock moves as the weeks are lived; the eleven-pm finish is Sunday's in London.
    let now = new Date('2026-10-07T10:00:00Z')
    const clocked = await appWithUser(undefined, { timezone: 'Europe/London', clock: () => now })
    cleanups.push(clocked.stop)
    const pid = await createProject(clocked, 'CTWS')
    const finish = async (title: string, at: string) => {
      now = new Date(at)
      await setStatus(clocked, await createTask(clocked, pid, title), 'done')
    }
    await finish('one', '2026-10-07T10:00:00Z')
    await finish('two', '2026-10-13T10:00:00Z')
    await finish('three', '2026-10-18T22:00:00Z')
    // Done twice in one week is one thing finished.
    const again = await createTask(clocked, pid, 'again')
    now = new Date('2026-10-20T10:00:00Z')
    await setStatus(clocked, again, 'done')
    await setStatus(clocked, again, 'todo')
    await setStatus(clocked, again, 'done')
    now = new Date('2026-10-22T10:00:00Z')

    const res = await clocked.app.inject({
      method: 'GET',
      url: '/api/v1/tasks?view=review-weeks',
      headers: clocked.authed,
    })
    expect(res.statusCode, res.body).toBe(200)
    const { weeks } = res.json() as { weeks: { from: string; finished: number }[] }
    // The project was made in the week of Oct 5: the list starts there.
    expect(weeks).toEqual([
      { from: '2026-10-19', finished: 1 },
      { from: '2026-10-12', finished: 2 },
      { from: '2026-10-05', finished: 1 },
    ])
  })
})
