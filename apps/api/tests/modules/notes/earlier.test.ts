import { afterEach, describe, expect, it } from 'vitest'
import { createMeeting } from '../../helpers/builders'
import { setupWith, type Harness } from '../../helpers/harness'

/**
 * "From earlier": what a repeating meeting's earlier occurrences left unticked in their notes,
 * ticked from the later one straight into the note it was written in.
 */

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

async function setup() {
  const ctx = await setupWith(cleanups, 'me@example.com', {
    clock: () => new Date('2026-10-12T09:00:00Z'),
  })
  // Atlas weekly, Mondays at 10:00 UTC.
  const atlas = await createMeeting(ctx, {
    title: 'Atlas weekly',
    startsLocal: '2026-06-29T10:00',
    rrule: 'FREQ=WEEKLY;BYDAY=MO',
  })
  return { ctx, meetingId: atlas.meetingId }
}

const noteOn = async (ctx: Harness, meetingId: string, occurrenceId: string, body: string) => {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/notes',
    headers: ctx.authed,
    payload: { body, anchor: { type: 'meeting', id: meetingId, occurrenceId } },
  })
  expect(res.statusCode, res.body).toBe(201)
  return res.json().id as string
}

const earlier = async (ctx: Harness, meetingId: string, recurrenceId: string) =>
  (
    await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/notes?view=earlier&meetingId=${meetingId}&recurrenceId=${recurrenceId}`,
      headers: ctx.authed,
    })
  ).json()

describe('From earlier', () => {
  it("lists the earlier occurrences' unticked items, the latest first, not this one's", async () => {
    const { ctx, meetingId } = await setup()
    const oct5 = await noteOn(
      ctx,
      meetingId,
      '2026-10-05T10:00',
      '- [ ] Ask Sam about the API\n- [ ] Book the room\n- [x] Send the agenda',
    )
    const sep28 = await noteOn(ctx, meetingId, '2026-09-28T10:00', '- [ ] Chase the invoice')
    await noteOn(ctx, meetingId, '2026-10-12T10:00', '- [ ] This week')
    expect(await earlier(ctx, meetingId, '2026-10-12T10:00')).toEqual({
      groups: [
        {
          noteId: oct5,
          recurrenceId: '2026-10-05T10:00',
          heldAt: '2026-10-05T10:00:00.000Z',
          items: [
            { line: 0, text: 'Ask Sam about the API' },
            { line: 1, text: 'Book the room' },
          ],
        },
        {
          noteId: sep28,
          recurrenceId: '2026-09-28T10:00',
          heldAt: '2026-09-28T10:00:00.000Z',
          items: [{ line: 0, text: 'Chase the invoice' }],
        },
      ],
    })
  })

  it('looks back 90 days and no further', async () => {
    const { ctx, meetingId } = await setup()
    await noteOn(ctx, meetingId, '2026-07-06T10:00', '- [ ] Too old')
    await noteOn(ctx, meetingId, '2026-07-20T10:00', '- [ ] Within')
    const { groups } = await earlier(ctx, meetingId, '2026-10-12T10:00')
    expect(groups.map((g: { recurrenceId: string }) => g.recurrenceId)).toEqual([
      '2026-07-20T10:00',
    ])
  })

  it('ticks an item in the note it was written in, and then lists it no more', async () => {
    const { ctx, meetingId } = await setup()
    const oct5 = await noteOn(
      ctx,
      meetingId,
      '2026-10-05T10:00',
      '- [ ] Ask Sam about the API\n- [ ] Book the room',
    )
    const ticked = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/notes/${oct5}/tick`,
      headers: ctx.authed,
      payload: { line: 1, text: 'Book the room' },
    })
    expect(ticked.statusCode, ticked.body).toBe(200)
    expect(ticked.json().body).toBe('- [ ] Ask Sam about the API\n- [x] Book the room')
    expect((await earlier(ctx, meetingId, '2026-10-12T10:00')).groups[0].items).toEqual([
      { line: 0, text: 'Ask Sam about the API' },
    ])
  })

  it('refuses to tick an item that is gone since it was read', async () => {
    const { ctx, meetingId } = await setup()
    const oct5 = await noteOn(ctx, meetingId, '2026-10-05T10:00', '- [ ] Book the room')
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/notes/${oct5}/tick`,
      headers: ctx.authed,
      payload: { line: 0, text: 'Book the hall' },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json()).toMatchObject({ type: 'urn:ctws:problem:note-item-moved' })
  })
})
