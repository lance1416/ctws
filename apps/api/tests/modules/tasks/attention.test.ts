import type { TaskId } from '@ctws/contracts'
import { afterEach, describe, expect, it } from 'vitest'
import { createProject, createTask } from '../../helpers/builders'
import { setupWith, type Harness } from '../../helpers/harness'

/**
 * The review's three further blocks: a line a project a week on how it is going, the deadlines
 * pushed later, and the backlog nothing has happened to in eight weeks.
 */

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

/** An account in UTC whose clock the test moves. */
async function setup(start: string) {
  const clock = { now: new Date(start) }
  const ctx = await setupWith(cleanups, 'me@example.com', {
    clock: () => clock.now,
    // A session lasts longer than the weeks these tests move the clock by.
    env: { sessionTtlDays: 400 },
  })
  const at = (when: string) => (clock.now = new Date(when))
  return { ctx, at }
}

const call = (
  ctx: Harness,
  method: 'GET' | 'PUT' | 'PATCH' | 'POST',
  url: string,
  payload?: object,
) =>
  ctx.app.inject({
    method,
    url: `/api/v1${url}`,
    headers: ctx.authed,
    ...(payload ? { payload } : {}),
  })

describe("a project's line for the week", () => {
  it('is said for its week, shown in the head with that week, and not in the next week', async () => {
    const { ctx } = await setup('2026-10-14T09:00:00Z')
    const atlas = await createProject(ctx, 'Atlas')
    const put = await call(ctx, 'PUT', `/projects/${atlas}/weeks/2026-10-12`, {
      line: 'Waiting on the landlord; quote by Friday',
    })
    expect(put.statusCode, put.body).toBe(200)
    expect(put.json()).toMatchObject({
      latestLine: { week: '2026-10-12', line: 'Waiting on the landlord; quote by Friday' },
    })
    expect((await call(ctx, 'GET', '/projects/lines?week=2026-10-12')).json()).toEqual({
      lines: [{ projectId: atlas, line: 'Waiting on the landlord; quote by Friday' }],
    })
    expect((await call(ctx, 'GET', '/projects/lines?week=2026-10-19')).json()).toEqual({
      lines: [],
    })
    expect((await call(ctx, 'GET', `/projects/${atlas}`)).json()).toMatchObject({
      latestLine: { week: '2026-10-12' },
    })
  })

  it('is the latest week that has one, written over in its week, and taken away with null', async () => {
    const { ctx } = await setup('2026-10-21T09:00:00Z')
    const atlas = await createProject(ctx, 'Atlas')
    await call(ctx, 'PUT', `/projects/${atlas}/weeks/2026-10-12`, { line: 'One' })
    await call(ctx, 'PUT', `/projects/${atlas}/weeks/2026-10-19`, { line: 'Two' })
    await call(ctx, 'PUT', `/projects/${atlas}/weeks/2026-10-19`, { line: 'Three' })
    expect((await call(ctx, 'GET', `/projects/${atlas}`)).json().latestLine).toEqual({
      week: '2026-10-19',
      line: 'Three',
    })
    await call(ctx, 'PUT', `/projects/${atlas}/weeks/2026-10-19`, { line: null })
    expect((await call(ctx, 'GET', `/projects/${atlas}`)).json().latestLine).toEqual({
      week: '2026-10-12',
      line: 'One',
    })
  })

  it('names its week by the Monday, and refuses another day', async () => {
    const { ctx } = await setup('2026-10-21T09:00:00Z')
    const atlas = await createProject(ctx, 'Atlas')
    expect(
      (await call(ctx, 'PUT', `/projects/${atlas}/weeks/2026-10-14`, { line: 'x' })).statusCode,
    ).toBe(400)
  })
})

describe('Pushed back', () => {
  it('lists a deadline moved twice in the week once, from the first to the last', async () => {
    const { ctx, at } = await setup('2026-10-05T09:00:00Z')
    const p = await createProject(ctx, 'Atlas')
    const apply = await createTask(ctx, p, 'Send the application', undefined, {
      dueAt: '2026-10-15T17:00:00.000Z',
    })
    at('2026-10-13T09:00:00Z')
    await call(ctx, 'PATCH', `/tasks/${apply}`, { dueAt: '2026-10-22T17:00:00.000Z' })
    at('2026-10-14T09:00:00Z')
    await call(ctx, 'PATCH', `/tasks/${apply}`, { dueAt: '2026-10-24T17:00:00.000Z' })
    const res = await call(ctx, 'GET', '/tasks?view=pushed&from=2026-10-12&to=2026-10-18')
    expect(res.json()).toEqual({
      tasks: [
        {
          id: apply,
          title: 'Send the application',
          projectId: p,
          from: '2026-10-15T17:00:00.000Z',
          to: '2026-10-24T17:00:00.000Z',
        },
      ],
    })
    // The week before has nothing.
    expect(
      (await call(ctx, 'GET', '/tasks?view=pushed&from=2026-10-05&to=2026-10-11')).json(),
    ).toEqual({ tasks: [] })
  })

  it('leaves out one pulled earlier, or moved and moved back', async () => {
    const { ctx, at } = await setup('2026-10-12T09:00:00Z')
    const p = await createProject(ctx, 'Atlas')
    const earlier = await createTask(ctx, p, 'Earlier', undefined, {
      dueAt: '2026-10-20T17:00:00.000Z',
    })
    const back = await createTask(ctx, p, 'Back', undefined, { dueAt: '2026-10-20T17:00:00.000Z' })
    at('2026-10-13T09:00:00Z')
    await call(ctx, 'PATCH', `/tasks/${earlier}`, { dueAt: '2026-10-16T17:00:00.000Z' })
    await call(ctx, 'PATCH', `/tasks/${back}`, { dueAt: '2026-10-27T17:00:00.000Z' })
    await call(ctx, 'PATCH', `/tasks/${back}`, { dueAt: '2026-10-20T17:00:00.000Z' })
    expect(
      (await call(ctx, 'GET', '/tasks?view=pushed&from=2026-10-12&to=2026-10-18')).json(),
    ).toEqual({ tasks: [] })
  })
})

describe('Untouched', () => {
  /** A backlog leaf made at the clock's time. */
  const backlog = (ctx: Harness, p: string, title: string) =>
    createTask(ctx, p as never, title, undefined, { status: 'backlog' })

  it('lists a backlog leaf nothing has happened to in nine weeks, not one from seven', async () => {
    const { ctx, at } = await setup('2026-08-01T09:00:00Z')
    const p = await createProject(ctx, 'Atlas')
    const old = await backlog(ctx, p, 'Sort the garage')
    at('2026-08-20T09:00:00Z')
    await backlog(ctx, p, 'Fix the gate')
    at('2026-10-05T09:00:00Z')
    const res = await call(ctx, 'GET', '/tasks?view=untouched')
    expect(res.json()).toMatchObject({ tasks: [{ id: old, title: 'Sort the garage' }], total: 1 })
  })

  it('drops off for eight weeks with Keep, and becomes cancelled with Drop', async () => {
    const { ctx, at } = await setup('2026-08-01T09:00:00Z')
    const p = await createProject(ctx, 'Atlas')
    const keep = await backlog(ctx, p, 'Keep me')
    const drop = await backlog(ctx, p, 'Drop me')
    at('2026-10-05T09:00:00Z')
    expect((await call(ctx, 'POST', `/tasks/${keep}/keep`)).statusCode).toBe(204)
    expect((await call(ctx, 'PATCH', `/tasks/${drop}`, { status: 'cancelled' })).statusCode).toBe(
      200,
    )
    expect((await call(ctx, 'GET', '/tasks?view=untouched')).json()).toEqual({
      tasks: [],
      total: 0,
    })
    // Keep is not progress: the task itself has not moved.
    expect((await call(ctx, 'GET', `/tasks/${keep}`)).json()).toMatchObject({ status: 'backlog' })
    // Eight weeks on, still untouched, it is back.
    at('2026-12-01T09:00:00Z')
    expect((await call(ctx, 'GET', '/tasks?view=untouched')).json()).toMatchObject({
      tasks: [{ id: keep }],
    })
  })

  it('lists ten, the longest untouched first, and counts the rest', async () => {
    const { ctx, at } = await setup('2026-07-01T09:00:00Z')
    const p = await createProject(ctx, 'Atlas')
    const made: TaskId[] = []
    for (let i = 0; i < 12; i++) {
      at(`2026-07-${String(i + 1).padStart(2, '0')}T09:00:00Z`)
      made.push(await backlog(ctx, p, `Old ${i}`))
    }
    at('2026-10-05T09:00:00Z')
    const res = (await call(ctx, 'GET', '/tasks?view=untouched')).json()
    expect(res.total).toBe(12)
    expect(res.tasks.map((t: { id: string }) => t.id)).toEqual(made.slice(0, 10))
  })
})
