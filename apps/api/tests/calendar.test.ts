import type { CalendarEntry } from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { appWithUser, createProject, createTask, type TaskCtx } from './helpers/tasks'

/**
 * THE CALENDAR'S TWO SUPPLIERS.
 *
 * The shell draws a grid and knows nothing about what a 截止 is. Each module answers for its own
 * dated things, and the DAY each one falls on is decided here, in the account's zone -- a client
 * that turned an instant into a day would put a 23:00 deadline on the wrong square for half the
 * world, silently and only for some users.
 */

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

async function setup(email = 'p@example.com'): Promise<TaskCtx> {
  const ctx = await appWithUser(email)
  cleanups.push(ctx.stop)
  return ctx
}

const web = (ctx: TaskCtx) => ({ ...ctx.authed, 'x-ctws-client': 'web' })

async function entries(ctx: TaskCtx, module: string, from: string, to: string) {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/api/v1/${module}/calendar?from=${from}&to=${to}`,
    headers: ctx.authed,
  })
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as { entries: CalendarEntry[] }).entries
}

const patchTask = (ctx: TaskCtx, id: string, payload: Record<string, unknown>) =>
  ctx.app.inject({ method: 'PATCH', url: `/api/v1/tasks/${id}`, headers: web(ctx), payload })

describe('the task calendar', () => {
  it('puts a plan and a deadline on their own squares, from one task', async () => {
    // A task can be both: 「这天做」 and 「这天前交」 are different facts, and a grid that showed
    // only one of them would quietly drop the other.
    const ctx = await setup()
    const pid = await createProject(ctx, 'CTWS')
    const id = await createTask(ctx, pid, '发 v0.8.0')
    await patchTask(ctx, id, { scheduledOn: '2026-10-05', dueAt: '2026-10-09T09:00:00.000Z' })

    const got = await entries(ctx, 'tasks', '2026-10-01', '2026-10-31')
    expect(got.map((e) => [e.day, e.kind])).toEqual([
      ['2026-10-05', 'planned'],
      ['2026-10-09', 'due'],
    ])
    // Two entries from one task need two ids, or the grid draws one and loses the other.
    expect(new Set(got.map((e) => e.id)).size).toBe(2)
    expect(got[0]).toMatchObject({ title: '发 v0.8.0', projectName: 'CTWS' })
  })

  it('decides the day in the ACCOUNT zone, not the server one', async () => {
    // 23:00 UTC on the 8th is the 9th in Shanghai and still the 8th in New York. The square a
    // deadline lands on is the whole question this endpoint answers.
    const shanghai = await setup('east@example.com')
    // Straight to the user row, the way the today tests set a zone: there is no endpoint for it
    // and inventing one just to be testable would be the test shaping the product.
    await shanghai.db.execute(sql`update users set timezone = 'Asia/Shanghai'`)
    const pid = await createProject(shanghai, 'P')
    const id = await createTask(shanghai, pid, '交稿')
    await patchTask(shanghai, id, { dueAt: '2026-10-08T23:00:00.000Z' })

    expect((await entries(shanghai, 'tasks', '2026-10-01', '2026-10-31'))[0]?.day).toBe(
      '2026-10-09',
    )
  })

  it('leaves out what is finished, and what is outside the window', async () => {
    const ctx = await setup()
    const pid = await createProject(ctx, 'CTWS')
    const done = await createTask(ctx, pid, '做完的')
    await patchTask(ctx, done, { scheduledOn: '2026-10-05', status: 'done' })
    const far = await createTask(ctx, pid, '下个月的')
    await patchTask(ctx, far, { scheduledOn: '2026-11-05' })
    const near = await createTask(ctx, pid, '这个月的')
    await patchTask(ctx, near, { scheduledOn: '2026-10-05' })

    const got = await entries(ctx, 'tasks', '2026-10-01', '2026-10-31')
    expect(got.map((e) => e.title)).toEqual(['这个月的'])
  })

  it('keeps one workspace out of another', async () => {
    const ctx = await setup()
    const pid = await createProject(ctx, 'CTWS')
    const id = await createTask(ctx, pid, '我的任务')
    await patchTask(ctx, id, { scheduledOn: '2026-10-05' })

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
    expect(await entries(theirs, 'tasks', '2026-10-01', '2026-10-31')).toEqual([])
  })
})

describe('the reading calendar', () => {
  const add = async (ctx: TaskCtx, payload: Record<string, unknown>): Promise<string> => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/reading',
      headers: web(ctx),
      payload,
    })
    expect(res.statusCode, res.body).toBe(201)
    return (res.json() as { id: string }).id
  }
  const plan = (ctx: TaskCtx, id: string, planOn: string | null) =>
    ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/reading/${id}`,
      headers: web(ctx),
      payload: { planOn },
    })

  it('answers for 想读完, which is the second module the grid is built on', async () => {
    const ctx = await setup()
    const id = await add(ctx, { kind: 'book', title: '设计心理学' })
    expect((await plan(ctx, id, '2026-10-07')).statusCode).toBe(200)

    const got = await entries(ctx, 'reading', '2026-10-01', '2026-10-31')
    expect(got).toHaveLength(1)
    expect(got[0]).toMatchObject({ day: '2026-10-07', title: '设计心理学', kind: 'to read' })
  })

  it('shows an untitled link by its url rather than leaving a blank square', async () => {
    const ctx = await setup()
    const id = await add(ctx, { kind: 'link', url: 'https://linear.app/now/a' })
    await plan(ctx, id, '2026-10-07')
    expect((await entries(ctx, 'reading', '2026-10-01', '2026-10-31'))[0]?.title).toBe(
      'https://linear.app/now/a',
    )
  })

  it('drops the plan when it is cleared, and leaves out what is read', async () => {
    const ctx = await setup()
    const read = await add(ctx, { kind: 'book', title: '读完了的' })
    await plan(ctx, read, '2026-10-07')
    await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/reading/${read}`,
      headers: web(ctx),
      payload: { status: 'done' },
    })
    const cleared = await add(ctx, { kind: 'book', title: '取消计划的' })
    await plan(ctx, cleared, '2026-10-07')
    expect((await plan(ctx, cleared, null)).statusCode).toBe(200)

    expect(await entries(ctx, 'reading', '2026-10-01', '2026-10-31')).toEqual([])
  })

  it('refuses a window that is not a pair of calendar days', async () => {
    const ctx = await setup()
    const bad = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/reading/calendar?from=2026-10-01',
      headers: ctx.authed,
    })
    expect(bad.statusCode).toBe(400)
  })
})
