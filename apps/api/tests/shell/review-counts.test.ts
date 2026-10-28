import { afterEach, describe, expect, it } from 'vitest'
import { createMeeting, createPerson, createReading } from '../helpers/builders'
import { appWithUser, type Harness } from '../helpers/harness'

/**
 * WHAT ELSE HAPPENED IN A WEEK (FR-081, the review's "Also this week"). A SHELL endpoint over
 * every module: each counts its own things of the window, and the shell only adds them up. The
 * clock is Thursday, October 22, 2026, 12:00 UTC (13:00 in London); the week is Monday the 19th
 * to Sunday the 25th, and it runs only to now.
 */

const NOW = new Date('2026-10-22T12:00:00Z')
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

async function setup(): Promise<Harness> {
  const ctx = await appWithUser(undefined, { timezone: 'Europe/London', clock: () => NOW })
  cleanups.push(ctx.stop)
  return ctx
}

const post = (ctx: Harness, url: string, payload: object) =>
  ctx.app.inject({ method: 'POST', url: `/api/v1${url}`, headers: ctx.authed, payload })

async function counts(ctx: Harness, from = '2026-10-19', to = '2026-10-25') {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/api/v1/review/counts?from=${from}&to=${to}`,
    headers: ctx.authed,
  })
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as { counts: Record<string, number> }).counts
}

describe('GET /review/counts', () => {
  it('counts what each module did in the week, up to now', async () => {
    const ctx = await setup()
    const held = await createMeeting(ctx, {
      title: 'Stripe: first screen',
      startsLocal: '2026-10-20T10:00',
      timeZone: 'Europe/London',
    })
    // Later today has not been held yet; last week was another week.
    await createMeeting(ctx, { startsLocal: '2026-10-22T15:00', timeZone: 'Europe/London' })
    await createMeeting(ctx, { startsLocal: '2026-10-15T10:00', timeZone: 'Europe/London' })
    // Two notes on one meeting are one meeting with notes.
    for (const body of ['Went well.', 'Next: the onsite.'])
      expect(
        (
          await post(ctx, '/notes', {
            body,
            anchor: { type: 'meeting', id: held.meetingId, occurrenceId: held.recurrenceId },
          })
        ).statusCode,
      ).toBe(201)

    const priya = await createPerson(ctx, { name: 'Priya Nair' })
    const message = (direction: string, occurredAt: string) =>
      post(ctx, '/communication', {
        direction,
        channel: 'email',
        parties: [{ type: 'person', id: priya.id }],
        occurredAt,
      })
    expect((await message('sent', '2026-10-19T09:00:00Z')).statusCode).toBe(201)
    expect((await message('sent', '2026-10-21T09:00:00Z')).statusCode).toBe(201)
    expect((await message('received', '2026-10-21T15:00:00Z')).statusCode).toBe(201)
    expect((await message('received', '2026-10-16T15:00:00Z')).statusCode).toBe(201)

    const book = await createReading(ctx)
    const done = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/reading/${book.id}`,
      headers: ctx.authed,
      payload: { status: 'done' },
    })
    expect(done.statusCode, done.body).toBe(200)

    expect(await counts(ctx)).toEqual({
      meetingsHeld: 1,
      meetingsWithNotes: 1,
      messagesSent: 2,
      messagesReceived: 1,
      readingFinished: 1,
      peopleAdded: 1,
    })
  })

  it('counts nothing of a week that is over before anything happened', async () => {
    const ctx = await setup()
    await createPerson(ctx, { name: 'Priya Nair' })
    expect(await counts(ctx, '2026-10-12', '2026-10-18')).toEqual({
      meetingsHeld: 0,
      meetingsWithNotes: 0,
      messagesSent: 0,
      messagesReceived: 0,
      readingFinished: 0,
      peopleAdded: 0,
    })
  })

  it('requires a session', async () => {
    const ctx = await setup()
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/review/counts?from=2026-10-19&to=2026-10-25',
    })
    expect(res.statusCode).toBe(401)
  })
})
