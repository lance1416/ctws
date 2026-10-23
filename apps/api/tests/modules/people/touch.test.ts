import { afterEach, describe, expect, it } from 'vitest'
import { createMeeting, createPerson } from '../../helpers/builders'
import { setupWith, type Harness } from '../../helpers/harness'

/**
 * WHO YOU WERE IN TOUCH WITH (FR-060): the latest exchange with each person, a message sent or
 * received or a meeting together, split into the last 30 days and 90 days or more ago. The clock
 * is pinned: Thursday 22 October 2026, noon in London.
 */
const NOW = new Date('2026-10-22T11:00:00.000Z')

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!()
})

const setup = () => setupWith(cleanups, undefined, { clock: () => NOW, timezone: 'Europe/London' })

async function message(ctx: Harness, personId: string, direction: string, occurredAt: string) {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/communication',
    headers: ctx.authed,
    payload: {
      direction,
      channel: 'email',
      occurredAt,
      parties: [{ type: 'person', id: personId }],
    },
  })
  expect(res.statusCode, res.body).toBe(201)
}

describe('GET /people?view=touch', () => {
  it('says who was in touch lately, latest first, and with whom it has been a while', async () => {
    const ctx = await setup()
    const sarah = await createPerson(ctx, { name: 'Sarah Whitfield' })
    const priya = await createPerson(ctx, { name: 'Priya Nair' })
    const mira = await createPerson(ctx, { name: 'Mira Chen' })
    const tom = await createPerson(ctx, { name: 'Tom Okafor' })
    const james = await createPerson(ctx, { name: 'James Ward' })
    const leo = await createPerson(ctx, { name: 'Leo' })
    await createPerson(ctx, { name: 'Never met' })

    await message(ctx, sarah.id, 'sent', '2026-10-22T09:00:00.000Z')
    await message(ctx, priya.id, 'received', '2026-10-16T08:00:00.000Z')
    // Mira: an old message, then a meeting together, which is the latest.
    await message(ctx, mira.id, 'sent', '2026-09-01T08:00:00.000Z')
    await createMeeting(ctx, {
      title: 'Coffee',
      startsLocal: '2026-10-16T15:00',
      timeZone: 'Europe/London',
      attendeeIds: [mira.id],
    })
    // A weekly meeting Tom stopped coming to in June: its last one with him is in June.
    await createMeeting(ctx, {
      title: 'Climbing',
      startsLocal: '2026-05-04T19:00',
      timeZone: 'Europe/London',
      rrule: 'FREQ=WEEKLY;UNTIL=20260622T235959Z',
      attendeeIds: [tom.id],
    })
    // A meeting still to come is not an exchange yet.
    await createMeeting(ctx, {
      title: 'Lunch',
      startsLocal: '2026-10-29T12:00',
      timeZone: 'Europe/London',
      attendeeIds: [leo.id],
    })
    await message(ctx, james.id, 'received', '2026-03-10T10:00:00.000Z')
    // Fifty days ago: neither lately nor a while.
    await message(ctx, leo.id, 'sent', '2026-09-02T10:00:00.000Z')

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/people?view=touch',
      headers: ctx.authed,
    })
    expect(res.statusCode, res.body).toBe(200)
    const { recent, quiet } = res.json()
    expect(recent).toEqual([
      { personId: sarah.id, kind: 'sent', at: '2026-10-22T09:00:00.000Z' },
      { personId: mira.id, kind: 'meeting', at: '2026-10-16T14:00:00.000Z' },
      { personId: priya.id, kind: 'received', at: '2026-10-16T08:00:00.000Z' },
    ])
    expect(quiet).toEqual([
      { personId: tom.id, kind: 'meeting', at: '2026-06-22T18:00:00.000Z' },
      { personId: james.id, kind: 'received', at: '2026-03-10T10:00:00.000Z' },
    ])
  })
})
