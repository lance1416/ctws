import { afterEach, describe, expect, it } from 'vitest'
import { createPerson, createProject, createTask } from '../helpers/builders'
import { secondUser, setupWith, type Harness } from '../helpers/harness'

/**
 * A reminder brings one thing to Today on a day, with a line of why: one a thing, hiding
 * nothing, gone with the thing, and never touching it.
 */

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

/** An account whose clock the test moves, a day at a time. */
async function setup() {
  const clock = { now: new Date('2026-11-11T09:00:00Z') }
  const ctx = await setupWith(cleanups, 'me@example.com', { clock: () => clock.now })
  const onDay = (day: string) => (clock.now = new Date(`${day}T09:00:00Z`))
  return { ctx, onDay }
}

const put = (ctx: Harness, type: string, id: string, payload: object) =>
  ctx.app.inject({
    method: 'PUT',
    url: `/api/v1/reminders/${type}/${id}`,
    headers: ctx.authed,
    payload,
  })

const get = async (ctx: Harness, url: string) =>
  ctx.app.inject({ method: 'GET', url: `/api/v1${url}`, headers: ctx.authed })

const due = async (ctx: Harness) => (await get(ctx, '/reminders?view=due')).json().reminders

describe('a reminder on a person', () => {
  it('comes up on its day and after, not before', async () => {
    const { ctx, onDay } = await setup()
    const priya = await createPerson(ctx, { name: 'Priya Shah' })
    const res = await put(ctx, 'person', priya.id, {
      onDay: '2026-11-12',
      why: 'Ask about the offer',
    })
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json()).toMatchObject({
      object: { type: 'person', id: priya.id, title: 'Priya Shah' },
      onDay: '2026-11-12',
      why: 'Ask about the offer',
    })

    onDay('2026-11-11')
    expect(await due(ctx)).toEqual([])
    onDay('2026-11-12')
    expect(await due(ctx)).toMatchObject([{ object: { id: priya.id }, why: 'Ask about the offer' }])
    onDay('2026-11-13')
    expect(await due(ctx)).toHaveLength(1)
  })

  it('is moved on by Later, and gone with Dismiss', async () => {
    const { ctx, onDay } = await setup()
    const priya = await createPerson(ctx, { name: 'Priya Shah' })
    await put(ctx, 'person', priya.id, { onDay: '2026-11-12', why: 'Ask about the offer' })
    onDay('2026-11-12')
    await put(ctx, 'person', priya.id, { onDay: '2026-11-14' })
    expect(await due(ctx)).toEqual([])
    onDay('2026-11-14')
    expect(await due(ctx)).toMatchObject([{ object: { id: priya.id }, why: null }])

    const off = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/reminders/person/${priya.id}`,
      headers: ctx.authed,
    })
    expect(off.statusCode).toBe(204)
    expect(await due(ctx)).toEqual([])
  })

  it("is the thing's one: a second replaces the first", async () => {
    const { ctx } = await setup()
    const priya = await createPerson(ctx, { name: 'Priya Shah' })
    await put(ctx, 'person', priya.id, { onDay: '2026-11-12', why: 'One' })
    await put(ctx, 'person', priya.id, { onDay: '2026-11-10', why: 'Two' })
    expect(await due(ctx)).toMatchObject([{ onDay: '2026-11-10', why: 'Two' }])
  })
})

describe("a thing's own reminder", () => {
  it('is null, not a 404, when there is none; a missing thing is the 404', async () => {
    const { ctx } = await setup()
    const priya = await createPerson(ctx, { name: 'Priya Shah' })
    const none = await get(ctx, `/reminders/person/${priya.id}`)
    expect(none.statusCode).toBe(200)
    expect(none.json()).toEqual({ reminder: null })
    await put(ctx, 'person', priya.id, { onDay: '2026-11-12' })
    expect((await get(ctx, `/reminders/person/${priya.id}`)).json()).toMatchObject({
      reminder: { onDay: '2026-11-12' },
    })
    const nobody = await get(ctx, '/reminders/person/01a1a42a-0000-7000-8000-000000000000')
    expect(nobody.statusCode).toBe(404)
  })
})

describe('a reminder on a task', () => {
  it('leaves the task as it is when dismissed', async () => {
    const { ctx, onDay } = await setup()
    const p = await createProject(ctx)
    const task = await createTask(ctx, p, 'Renew the passport')
    await put(ctx, 'task', task, { onDay: '2026-11-12' })
    onDay('2026-11-12')
    await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/reminders/task/${task}`,
      headers: ctx.authed,
    })
    expect((await get(ctx, `/tasks/${task}`)).json()).toMatchObject({ status: 'todo' })
  })

  it('goes with the task when it is deleted', async () => {
    const { ctx, onDay } = await setup()
    const p = await createProject(ctx)
    const task = await createTask(ctx, p, 'Renew the passport')
    await put(ctx, 'task', task, { onDay: '2026-11-12' })
    await ctx.app.inject({ method: 'DELETE', url: `/api/v1/tasks/${task}`, headers: ctx.authed })
    onDay('2026-11-12')
    expect(await due(ctx)).toEqual([])
    const left = await ctx.db.execute(`select count(*)::int as n from reminders`)
    expect(left.rows[0]).toEqual({ n: 0 })
  })
})

describe('the calendar', () => {
  it('has each reminder on its day, inside the window asked for', async () => {
    const { ctx } = await setup()
    const priya = await createPerson(ctx, { name: 'Priya Shah' })
    await put(ctx, 'person', priya.id, { onDay: '2026-11-12' })
    const inside = await get(ctx, '/reminders?view=calendar&from=2026-11-01&to=2026-11-30')
    expect(inside.json().entries).toMatchObject([
      { type: 'person', id: priya.id, kind: 'reminder', day: '2026-11-12', title: 'Priya Shah' },
    ])
    const outside = await get(ctx, '/reminders?view=calendar&from=2026-12-01&to=2026-12-31')
    expect(outside.json().entries).toEqual([])
  })
})

describe('another workspace', () => {
  it('can neither set nor read a reminder on a thing it does not see', async () => {
    const { ctx } = await setup()
    const priya = await createPerson(ctx, { name: 'Priya Shah' })
    await put(ctx, 'person', priya.id, { onDay: '2026-11-10' })
    const other = await secondUser(ctx)
    expect((await put(other, 'person', priya.id, { onDay: '2026-11-10' })).statusCode).toBe(404)
    expect((await get(other, `/reminders/person/${priya.id}`)).statusCode).toBe(404)
    expect(await due(other)).toEqual([])
    // And dismissing someone else's leaves it.
    await other.app.inject({
      method: 'DELETE',
      url: `/api/v1/reminders/person/${priya.id}`,
      headers: other.authed,
    })
    expect(await due(ctx)).toHaveLength(1)
  })
})
