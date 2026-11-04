import { afterEach, describe, expect, it } from 'vitest'
import { createPerson, createProject, createTask } from '../../helpers/builders'
import { setupWith, type Harness } from '../../helpers/harness'

/**
 * Wrapping up a day: a note of the day's own, written only when there are words, one a day; the
 * plans nothing was done to; and when Today offers it.
 */

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

async function setup(start = '2026-10-22T16:00:00Z') {
  const clock = { now: new Date(start) }
  const ctx = await setupWith(cleanups, 'me@example.com', { clock: () => clock.now })
  const at = (when: string) => (clock.now = new Date(when))
  return { ctx, at }
}

const call = (ctx: Harness, method: 'GET' | 'PUT' | 'PATCH', url: string, payload?: object) =>
  ctx.app.inject({
    method,
    url: `/api/v1${url}`,
    headers: ctx.authed,
    ...(payload ? { payload } : {}),
  })

describe("a day's note", () => {
  it('is none until written, then the same note each time the day is opened', async () => {
    const { ctx } = await setup()
    expect((await call(ctx, 'GET', '/notes/days/2026-10-22')).json()).toEqual({ note: null })
    const put = await call(ctx, 'PUT', '/notes/days/2026-10-22', { body: 'A good day.' })
    expect(put.statusCode, put.body).toBe(200)
    const { note } = put.json()
    expect(note).toMatchObject({
      day: '2026-10-22',
      title: null,
      body: 'A good day.',
      anchor: null,
      folderId: null,
    })
    await call(ctx, 'PUT', '/notes/days/2026-10-22', { body: 'A good day. Then rain.' })
    expect((await call(ctx, 'GET', '/notes/days/2026-10-22')).json()).toMatchObject({
      note: { id: note.id, body: 'A good day. Then rain.' },
    })
  })

  it('is not made when left blank, and goes when emptied', async () => {
    const { ctx } = await setup()
    expect((await call(ctx, 'PUT', '/notes/days/2026-10-22', { body: '  ' })).json()).toEqual({
      note: null,
    })
    expect((await call(ctx, 'GET', '/notes')).json().notes).toEqual([])
    await call(ctx, 'PUT', '/notes/days/2026-10-22', { body: 'Something.' })
    await call(ctx, 'PUT', '/notes/days/2026-10-22', { body: '' })
    expect((await call(ctx, 'GET', '/notes/days/2026-10-22')).json()).toEqual({ note: null })
  })

  it('is among the notes, said by its day, and takes @ like any other', async () => {
    const { ctx } = await setup()
    const lena = await createPerson(ctx, { name: 'Lena' })
    await call(ctx, 'PUT', '/notes/days/2026-10-22', {
      body: `Lunch with [@Lena](ctws://person/${lena.id}).`,
    })
    const listed = (await call(ctx, 'GET', '/notes')).json().notes
    expect(listed).toMatchObject([{ day: '2026-10-22' }])
    const mentions = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/relations?type=person&id=${lena.id}`,
      headers: ctx.authed,
    })
    expect(mentions.body).toContain(listed[0].id)
  })

  it("cannot be given a title or a folder: it is the day's and nothing else", async () => {
    const { ctx } = await setup()
    const { note } = (await call(ctx, 'PUT', '/notes/days/2026-10-22', { body: 'x' })).json()
    expect((await call(ctx, 'PATCH', `/notes/${note.id}`, { title: 'Mine' })).statusCode).toBe(422)
  })

  it('marks its day on the calendar', async () => {
    const { ctx } = await setup()
    const { note } = (await call(ctx, 'PUT', '/notes/days/2026-10-22', { body: 'x' })).json()
    const res = await call(ctx, 'GET', '/notes?view=calendar&from=2026-10-01&to=2026-10-31')
    expect(res.json().entries).toMatchObject([
      { type: 'note', id: note.id, kind: 'day-note', day: '2026-10-22' },
    ])
  })
})

describe('planned and not touched', () => {
  it('is what was planned for the day and had nothing done to it that day', async () => {
    const { ctx, at } = await setup('2026-10-21T09:00:00Z')
    const p = await createProject(ctx, 'Atlas')
    const idle = await createTask(ctx, p, 'Idle', undefined, { scheduledOn: '2026-10-22' })
    const worked = await createTask(ctx, p, 'Worked', undefined, { scheduledOn: '2026-10-22' })
    const done = await createTask(ctx, p, 'Done', undefined, { scheduledOn: '2026-10-22' })
    await createTask(ctx, p, 'Tomorrow', undefined, { scheduledOn: '2026-10-23' })
    at('2026-10-22T10:00:00Z')
    await call(ctx, 'PATCH', `/tasks/${worked}`, { status: 'in_progress' })
    await call(ctx, 'PATCH', `/tasks/${done}`, { status: 'done' })
    const res = await call(ctx, 'GET', '/tasks?view=untouched-plan&day=2026-10-22')
    expect(res.json().tasks.map((t: { id: string }) => t.id)).toEqual([idle])
  })
})

describe('the time to wrap up', () => {
  it('is 18:00 to begin with, changed, or turned off', async () => {
    const { ctx } = await setup()
    expect((await call(ctx, 'GET', '/auth/me')).json()).toMatchObject({ wrapUpAt: '18:00' })
    expect((await call(ctx, 'PATCH', '/auth/me', { wrapUpAt: '17:30' })).json()).toMatchObject({
      wrapUpAt: '17:30',
    })
    expect((await call(ctx, 'PATCH', '/auth/me', { wrapUpAt: null })).json()).toMatchObject({
      wrapUpAt: null,
    })
    expect((await call(ctx, 'PATCH', '/auth/me', { wrapUpAt: '25:00' })).statusCode).toBe(400)
  })
})
