import type { TaskId } from '@ctws/contracts'
import { afterEach, describe, expect, it } from 'vitest'
import { createProject, createTask } from '../../helpers/builders'
import { setupWith, tasksOf, type Harness } from '../../helpers/harness'

/**
 * A repeating task: done or cancelled, its next one is made there and then, with its days moved
 * by the rule; a repeat is a leaf's, and needs a day to count from.
 */

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

/** An account in Shanghai whose clock stands at `at`. */
const setup = (at: string) =>
  setupWith(cleanups, 'me@example.com', {
    clock: () => new Date(at),
    timezone: 'Asia/Shanghai',
  })

const patch = (ctx: Harness, id: TaskId, payload: object) =>
  ctx.app.inject({ method: 'PATCH', url: `/api/v1/tasks/${id}`, headers: ctx.authed, payload })

const read = async (ctx: Harness, id: string) =>
  (await ctx.app.inject({ method: 'GET', url: `/api/v1/tasks/${id}`, headers: ctx.authed })).json()

const MONTHLY_1ST = { kind: 'rule', rule: 'FREQ=MONTHLY;BYMONTHDAY=1' } as const

describe('done, a repeating task comes round', () => {
  it('pays the rent again on the 1st of the next month, as a new task to do', async () => {
    // Nov 1, 10:00 in Shanghai.
    const ctx = await setup('2026-11-01T02:00:00Z')
    const p = await createProject(ctx)
    const rent = await createTask(ctx, p, 'Pay rent', undefined, {
      scheduledOn: '2026-11-01',
      repeat: MONTHLY_1ST,
      notes: 'The usual account',
    })
    const done = await patch(ctx, rent, { status: 'done' })
    expect(done.statusCode, done.body).toBe(200)
    const { nextId } = done.json()
    expect(nextId).toEqual(expect.any(String))
    expect(await read(ctx, nextId)).toMatchObject({
      title: 'Pay rent',
      notes: 'The usual account',
      projectId: p,
      status: 'todo',
      scheduledOn: '2026-12-01',
      repeat: MONTHLY_1ST,
      nextId: null,
    })
    // Next to it among its siblings, the done one kept where it was.
    expect((await tasksOf(ctx, p)).map((t) => t.id)).toEqual([rent, nextId])
  })

  it('counts a while after done from the day it was done', async () => {
    // Done Nov 9, three days late: the next is Nov 12.
    const ctx = await setup('2026-11-09T02:00:00Z')
    const p = await createProject(ctx)
    const water = await createTask(ctx, p, 'Water the plants', undefined, {
      scheduledOn: '2026-11-04',
      repeat: { kind: 'after', every: 3, unit: 'day' },
    })
    const { nextId } = (await patch(ctx, water, { status: 'done' })).json()
    expect(await read(ctx, nextId)).toMatchObject({ scheduledOn: '2026-11-12' })
  })

  it('skips the weeks that went by: next Monday from today', async () => {
    // Planned Monday Oct 19, done Wednesday Nov 4.
    const ctx = await setup('2026-11-04T02:00:00Z')
    const p = await createProject(ctx)
    const report = await createTask(ctx, p, 'Weekly report', undefined, {
      scheduledOn: '2026-10-19',
      repeat: { kind: 'rule', rule: 'FREQ=WEEKLY;BYDAY=MO' },
    })
    const { nextId } = (await patch(ctx, report, { status: 'done' })).json()
    expect(await read(ctx, nextId)).toMatchObject({ scheduledOn: '2026-11-09' })
  })

  it('moves the plan and the deadline together, the deadline at its own time of day', async () => {
    const ctx = await setup('2026-11-10T02:00:00Z')
    const p = await createProject(ctx)
    const task = await createTask(ctx, p, 'Invoice', undefined, {
      scheduledOn: '2026-11-10',
      // Nov 13, 16:00 in Shanghai.
      dueAt: '2026-11-13T08:00:00.000Z',
      repeat: { kind: 'rule', rule: 'FREQ=MONTHLY;BYMONTHDAY=10' },
    })
    const { nextId } = (await patch(ctx, task, { status: 'done' })).json()
    expect(await read(ctx, nextId)).toMatchObject({
      scheduledOn: '2026-12-10',
      dueAt: '2026-12-13T08:00:00.000Z',
    })
  })

  it('follows the deadline when there is no plan', async () => {
    const ctx = await setup('2026-11-02T02:00:00Z')
    const p = await createProject(ctx)
    const task = await createTask(ctx, p, 'Timesheet', undefined, {
      // Friday Nov 6, 17:00 in Shanghai.
      dueAt: '2026-11-06T09:00:00.000Z',
      repeat: { kind: 'rule', rule: 'FREQ=WEEKLY;BYDAY=FR' },
    })
    const { nextId } = (await patch(ctx, task, { status: 'done' })).json()
    expect(await read(ctx, nextId)).toMatchObject({
      scheduledOn: null,
      dueAt: '2026-11-13T09:00:00.000Z',
    })
  })

  it('comes round when cancelled too', async () => {
    const ctx = await setup('2026-11-01T02:00:00Z')
    const p = await createProject(ctx)
    const rent = await createTask(ctx, p, 'Pay rent', undefined, {
      scheduledOn: '2026-11-01',
      repeat: MONTHLY_1ST,
    })
    expect((await patch(ctx, rent, { status: 'cancelled' })).json().nextId).toEqual(
      expect.any(String),
    )
  })

  it('stops at the end day of its rule', async () => {
    const ctx = await setup('2026-11-01T02:00:00Z')
    const p = await createProject(ctx)
    const rent = await createTask(ctx, p, 'Pay rent', undefined, {
      scheduledOn: '2026-11-01',
      repeat: { kind: 'rule', rule: 'FREQ=MONTHLY;BYMONTHDAY=1;UNTIL=20261130' },
    })
    expect((await patch(ctx, rent, { status: 'done' })).json().nextId).toBeNull()
  })

  it('stops repeating when its repeat is taken off, and this one stays as it is', async () => {
    const ctx = await setup('2026-11-01T02:00:00Z')
    const p = await createProject(ctx)
    const rent = await createTask(ctx, p, 'Pay rent', undefined, {
      scheduledOn: '2026-11-01',
      repeat: MONTHLY_1ST,
    })
    expect((await patch(ctx, rent, { repeat: null })).json()).toMatchObject({
      repeat: null,
      scheduledOn: '2026-11-01',
    })
    expect((await patch(ctx, rent, { status: 'done' })).json().nextId).toBeNull()
  })
})

describe('only a leaf with a day repeats', () => {
  it('refuses a repeat on a parent', async () => {
    const ctx = await setup('2026-11-01T02:00:00Z')
    const p = await createProject(ctx)
    const parent = await createTask(ctx, p, 'Move house')
    await createTask(ctx, p, 'Pack', parent)
    const res = await patch(ctx, parent, { repeat: MONTHLY_1ST, dueAt: '2026-11-30T00:00:00Z' })
    expect(res.statusCode).toBe(422)
    expect(res.json()).toMatchObject({ type: 'urn:ctws:problem:repeat-on-parent' })
  })

  it('refuses a subtask under a repeating task, made there or moved there', async () => {
    const ctx = await setup('2026-11-01T02:00:00Z')
    const p = await createProject(ctx)
    const rent = await createTask(ctx, p, 'Pay rent', undefined, {
      scheduledOn: '2026-11-01',
      repeat: MONTHLY_1ST,
    })
    const made = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      headers: ctx.authed,
      payload: { projectId: p, parentId: rent, title: 'Find the account' },
    })
    expect(made.statusCode).toBe(422)
    expect(made.json()).toMatchObject({ type: 'urn:ctws:problem:repeat-takes-no-children' })

    const other = await createTask(ctx, p, 'Find the account')
    const moved = await patch(ctx, other, { projectId: p, parentId: rent })
    expect(moved.statusCode).toBe(422)
    expect(moved.json()).toMatchObject({ type: 'urn:ctws:problem:repeat-takes-no-children' })
  })

  it('refuses a repeat with no day to count from, and taking away its last day', async () => {
    const ctx = await setup('2026-11-01T02:00:00Z')
    const p = await createProject(ctx)
    const made = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      headers: ctx.authed,
      payload: { projectId: p, title: 'Someday', repeat: MONTHLY_1ST },
    })
    expect(made.statusCode).toBe(422)
    expect(made.json()).toMatchObject({ type: 'urn:ctws:problem:repeat-needs-a-date' })

    const rent = await createTask(ctx, p, 'Pay rent', undefined, {
      scheduledOn: '2026-11-01',
      repeat: MONTHLY_1ST,
    })
    expect((await patch(ctx, rent, { scheduledOn: null })).statusCode).toBe(422)
    expect((await patch(ctx, rent, { scheduledOn: null, repeat: null })).statusCode).toBe(200)
  })

  it('refuses a rule outside the subset, saying why', async () => {
    const ctx = await setup('2026-11-01T02:00:00Z')
    const p = await createProject(ctx)
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      headers: ctx.authed,
      payload: {
        projectId: p,
        title: 'Stand up',
        scheduledOn: '2026-11-02',
        repeat: { kind: 'rule', rule: 'FREQ=DAILY;BYHOUR=9' },
      },
    })
    expect(res.statusCode).toBe(400)
    expect(res.body).toContain('BYHOUR')
  })
})

describe('deleting one of them', () => {
  const remove = (ctx: Harness, id: TaskId, series?: string) =>
    ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/tasks/${id}${series ? `?series=${series}` : ''}`,
      headers: ctx.authed,
    })

  it('skips it and keeps the series going with series=keep', async () => {
    const ctx = await setup('2026-11-01T02:00:00Z')
    const p = await createProject(ctx)
    const rent = await createTask(ctx, p, 'Pay rent', undefined, {
      scheduledOn: '2026-11-01',
      repeat: MONTHLY_1ST,
    })
    expect((await remove(ctx, rent, 'keep')).statusCode).toBe(204)
    const left = await tasksOf(ctx, p)
    expect(left).toHaveLength(1)
    expect(await read(ctx, left[0]!.id)).toMatchObject({
      scheduledOn: '2026-12-01',
      status: 'todo',
    })
  })

  it('ends the series with series=stop, and without saying', async () => {
    const ctx = await setup('2026-11-01T02:00:00Z')
    const p = await createProject(ctx)
    for (const series of ['stop', undefined]) {
      const rent = await createTask(ctx, p, 'Pay rent', undefined, {
        scheduledOn: '2026-11-01',
        repeat: MONTHLY_1ST,
      })
      expect((await remove(ctx, rent, series)).statusCode).toBe(204)
    }
    expect(await tasksOf(ctx, p)).toHaveLength(0)
  })

  it('makes no second next for one already done', async () => {
    const ctx = await setup('2026-11-01T02:00:00Z')
    const p = await createProject(ctx)
    const rent = await createTask(ctx, p, 'Pay rent', undefined, {
      scheduledOn: '2026-11-01',
      repeat: MONTHLY_1ST,
    })
    await patch(ctx, rent, { status: 'done' })
    await remove(ctx, rent, 'keep')
    expect(await tasksOf(ctx, p)).toHaveLength(1)
  })
})

describe('the rules Product settled', () => {
  it('does not bring a weekly one back on the day it was done', async () => {
    // Monday Nov 9, Shanghai: a Monday report done on the Monday comes next on the Monday after.
    const ctx = await setup('2026-11-09T02:00:00Z')
    const p = await createProject(ctx)
    const report = await createTask(ctx, p, 'Weekly report', undefined, {
      scheduledOn: '2026-11-02',
      repeat: { kind: 'rule', rule: 'FREQ=WEEKLY;BYDAY=MO' },
    })
    const { nextId } = (await patch(ctx, report, { status: 'done' })).json()
    expect(await read(ctx, nextId)).toMatchObject({ scheduledOn: '2026-11-16' })
  })

  it("puts the 31st on a shorter month's last day, and goes back to the 31st after", async () => {
    const ctx = await setup('2026-01-31T02:00:00Z')
    const p = await createProject(ctx)
    const rent = await createTask(ctx, p, 'Statement', undefined, {
      scheduledOn: '2026-01-31',
      repeat: { kind: 'rule', rule: 'FREQ=MONTHLY' },
    })
    const feb = await read(ctx, (await patch(ctx, rent, { status: 'done' })).json().nextId)
    expect(feb).toMatchObject({
      scheduledOn: '2026-02-28',
      repeat: { kind: 'rule', rule: 'FREQ=MONTHLY;BYMONTHDAY=31' },
    })
    // Done on its day in February, the next one is back on the 31st.
    const marClock = await setup('2026-02-28T02:00:00Z')
    const q = await createProject(marClock)
    const again = await createTask(marClock, q, 'Statement', undefined, {
      scheduledOn: '2026-02-28',
      repeat: { kind: 'rule', rule: 'FREQ=MONTHLY;BYMONTHDAY=31' },
    })
    const mar = await read(
      marClock,
      (await patch(marClock, again, { status: 'done' })).json().nextId,
    )
    expect(mar).toMatchObject({ scheduledOn: '2026-03-31' })
  })

  it('takes back the next one when opened again, if nobody has touched it', async () => {
    const ctx = await setup('2026-11-01T02:00:00Z')
    const p = await createProject(ctx)
    const rent = await createTask(ctx, p, 'Pay rent', undefined, {
      scheduledOn: '2026-11-01',
      repeat: MONTHLY_1ST,
    })
    const next = (await patch(ctx, rent, { status: 'done' })).json().nextId
    const reopened = await patch(ctx, rent, { status: 'todo' })
    expect(reopened.json()).toMatchObject({ status: 'todo', nextId: null })
    expect((await tasksOf(ctx, p)).map((t) => t.id)).toEqual([rent])
    expect(
      (await ctx.app.inject({ method: 'GET', url: `/api/v1/tasks/${next}`, headers: ctx.authed }))
        .statusCode,
    ).toBe(404)
    // Done again, a fresh next is made.
    expect((await patch(ctx, rent, { status: 'done' })).json().nextId).toEqual(expect.any(String))
  })

  it('keeps the next one when it has been worked on, and still makes no second', async () => {
    const ctx = await setup('2026-11-01T02:00:00Z')
    const p = await createProject(ctx)
    const rent = await createTask(ctx, p, 'Pay rent', undefined, {
      scheduledOn: '2026-11-01',
      repeat: MONTHLY_1ST,
    })
    const next = (await patch(ctx, rent, { status: 'done' })).json().nextId
    await patch(ctx, next, { status: 'in_progress' })
    expect((await patch(ctx, rent, { status: 'todo' })).json()).toMatchObject({ nextId: next })
    expect((await patch(ctx, rent, { status: 'done' })).json().nextId).toBe(next)
    expect(await tasksOf(ctx, p)).toHaveLength(2)
  })
})
