import type { CalendarEntry } from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { createProject, createTask, type Harness, setupWith, web } from '../../helpers/harness'

/**
 * The day each task entry falls on is decided here, in the account's zone: a client that turned
 * an instant into a day would put a 23:00 deadline on the wrong square for half the world.
 */

const cleanups: (() => Promise<void>)[] = []

const setup = (email = 'p@example.com') => setupWith(cleanups, email)
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

async function entries(ctx: Harness, from: string, to: string) {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/api/v1/tasks?view=calendar&from=${from}&to=${to}`,
    headers: ctx.authed,
  })
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as { entries: CalendarEntry[] }).entries
}

const patchTask = (ctx: Harness, id: string, payload: Record<string, unknown>) =>
  ctx.app.inject({ method: 'PATCH', url: `/api/v1/tasks/${id}`, headers: web(ctx), payload })

describe('the task calendar', () => {
  it('puts a plan and a deadline on their own squares, from one task', async () => {
    // A task can be both: the day to work on it and the day it is due are different facts.
    const ctx = await setup()
    const pid = await createProject(ctx, 'CTWS')
    const id = await createTask(ctx, pid, '发 v0.8.0')
    await patchTask(ctx, id, { scheduledOn: '2026-10-05', dueAt: '2026-10-09T09:00:00.000Z' })

    const got = await entries(ctx, '2026-10-01', '2026-10-31')
    expect(got.map((e) => [e.day, e.kind])).toEqual([
      ['2026-10-05', 'planned'],
      ['2026-10-09', 'due'],
    ])
    // Two entries from one task: the task's own id on both, told apart by what the date is.
    expect(got.map((e) => [e.type, e.id])).toEqual([
      ['task', id],
      ['task', id],
    ])
    expect(got[0]).toMatchObject({ title: '发 v0.8.0', projectName: 'CTWS' })
  })

  it('decides the day in the ACCOUNT zone, not the server one', async () => {
    // 23:00 UTC on the 8th is the 9th in Shanghai and still the 8th in New York.
    const shanghai = await setup('east@example.com')
    // Straight to the user row: there is no endpoint for the zone.
    await shanghai.db.execute(sql`update users set timezone = 'Asia/Shanghai'`)
    const pid = await createProject(shanghai, 'P')
    const id = await createTask(shanghai, pid, '交稿')
    await patchTask(shanghai, id, { dueAt: '2026-10-08T23:00:00.000Z' })

    expect((await entries(shanghai, '2026-10-01', '2026-10-31'))[0]?.day).toBe('2026-10-09')
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

    const got = await entries(ctx, '2026-10-01', '2026-10-31')
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
    const theirs: Harness = {
      ...ctx,
      authed: {
        'x-ctws-client': 'web',
        cookie: String(other.headers['set-cookie']).split(';')[0]!,
      },
    }
    expect(await entries(theirs, '2026-10-01', '2026-10-31')).toEqual([])
  })
})
