import type {
  CalendarEntry,
  LinksResponse,
  MeetingOccurrence,
  PersonResponse,
} from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import type { Queryable } from '../../../src/platform/db/client'
import {
  createProject,
  expectBlockedWhile,
  setupWith,
  type Harness,
  web,
} from '../../helpers/harness'

/**
 * MEETINGS, on iCalendar's `VEVENT` (RFC 5545).
 *
 * `occurrences.test.ts` holds the recurrence and DST arithmetic, without a database. What is
 * tested here is everything that arithmetic has to be wired to: the three edit scopes, overrides
 * surviving a round trip, and the window being cut on the ACCOUNT's days while each meeting keeps
 * its OWN zone -- a meeting in Toronto and one in London are not the same wall clock, and neither
 * is the account's.
 */

const cleanups: (() => Promise<void>)[] = []

const setup = (email = 'p@example.com') => setupWith(cleanups, email)
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

const WEEKLY = {
  title: '周会',
  startsLocal: '2026-10-20T09:00',
  timeZone: 'America/Toronto',
  durationMinutes: 60,
  rrule: 'FREQ=WEEKLY;BYDAY=TU',
}

async function arrange(
  ctx: Harness,
  payload: Record<string, unknown> = WEEKLY,
): Promise<MeetingOccurrence> {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/meetings',
    headers: web(ctx),
    payload,
  })
  if (res.statusCode !== 201) throw new Error(`arrange: ${res.statusCode} ${res.body}`)
  return res.json() as MeetingOccurrence
}

const patch = (ctx: Harness, id: string, payload: Record<string, unknown>) =>
  ctx.app.inject({ method: 'PATCH', url: `/api/v1/meetings/${id}`, headers: web(ctx), payload })

const cancel = (ctx: Harness, id: string, query = '') =>
  ctx.app.inject({ method: 'DELETE', url: `/api/v1/meetings/${id}${query}`, headers: web(ctx) })

async function listed(ctx: Harness, query: string): Promise<MeetingOccurrence[]> {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/api/v1/meetings${query}`,
    headers: ctx.authed,
  })
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as { meetings: MeetingOccurrence[] }).meetings
}

async function entries(ctx: Harness, from: string, to: string): Promise<CalendarEntry[]> {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/api/v1/meetings/calendar?from=${from}&to=${to}`,
    headers: ctx.authed,
  })
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as { entries: CalendarEntry[] }).entries
}

async function person(ctx: Harness, name: string): Promise<PersonResponse> {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/people',
    headers: web(ctx),
    payload: { name },
  })
  expect(res.statusCode, res.body).toBe(201)
  return res.json() as PersonResponse
}

const days = (got: { startsLocal: string }[]) => got.map((o) => o.startsLocal.slice(0, 10))

describe('arranging a meeting', () => {
  it('keeps the wall clock and the zone it was agreed in', async () => {
    const ctx = await setup()
    const one = await arrange(ctx, { ...WEEKLY, rrule: null, location: 'Zoom' })
    expect(one).toMatchObject({
      startsLocal: '2026-10-20T09:00',
      timeZone: 'America/Toronto',
      durationMinutes: 60,
      recurrenceId: '2026-10-20T09:00',
      location: 'Zoom',
    })
    // 09:00 Toronto in October is 13:00Z. The instant is derived, never stored.
    expect(one.startsAt).toBe('2026-10-20T13:00:00.000Z')
  })

  it('refuses a repeat rule that schedules nothing', async () => {
    const ctx = await setup()
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/meetings',
      headers: web(ctx),
      payload: { ...WEEKLY, rrule: 'FREQ=WEEKLY;COUNT=0' },
    })
    expect(res.statusCode).toBe(422)
  })

  it('refuses a start its repeat rule does not fall on, and says where the rule does', async () => {
    // RFC 5545 makes the start the first occurrence, and calls the set undefined when the rule
    // does not land on it. Everything here finds a series by its start, so it is refused.
    const ctx = await setup()
    for (const [startsLocal, rrule, first] of [
      // A Tuesday, in a Monday series.
      ['2026-10-13T18:00', 'FREQ=WEEKLY;BYDAY=MO', '2026-10-19T18:00'],
      // The 19th, in a series on the 13th.
      ['2026-10-19T18:00', 'FREQ=MONTHLY;BYMONTHDAY=13', '2026-11-13T18:00'],
    ]) {
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/meetings',
        headers: web(ctx),
        payload: { ...WEEKLY, startsLocal, rrule },
      })
      expect(res.statusCode, res.body).toBe(422)
      expect(res.json().detail).toContain(first)
    }
    expect(await listed(ctx, '?from=2026-10-01&to=2026-11-30')).toEqual([])
  })

  it('refuses a zone this system does not know', async () => {
    const ctx = await setup()
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/meetings',
      headers: web(ctx),
      payload: { ...WEEKLY, timeZone: 'Mars/Olympus' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('holds the people in the room, out of the people module', async () => {
    const ctx = await setup()
    const a = await person(ctx, '陈颖')
    const b = await person(ctx, '李雷')
    const one = await arrange(ctx, { ...WEEKLY, attendeeIds: [a.id, b.id] })
    expect(one.attendees.map((p) => p.name)).toEqual(['李雷', '陈颖'])
  })
})

describe('a recurring meeting on the calendar', () => {
  it('appears on every occurrence in the window, each with its own identity', async () => {
    const ctx = await setup()
    await arrange(ctx)
    const got = await entries(ctx, '2026-10-20', '2026-11-10')
    expect(got.map((e) => e.day)).toEqual(['2026-10-20', '2026-10-27', '2026-11-03', '2026-11-10'])
    // Each square needs its own id, or the grid draws one and loses the rest.
    expect(new Set(got.map((e) => e.id)).size).toBe(4)
  })

  it('holds 09:00 in Toronto across the DST change, and says which zone that is', async () => {
    // The account is in UTC and the meeting is in Toronto: the grid shows the ACCOUNT's clock --
    // ...which answers when to be there -- and the meeting's own time travels beside it.
    const ctx = await setup()
    await arrange(ctx)
    const got = await entries(ctx, '2026-10-20', '2026-11-10')
    expect(got.map((e) => e.time)).toEqual(['13:00', '13:00', '14:00', '14:00'])
    // And when it ends, on the same clock: a meeting that has started is not yet over, and the
    // day's line can only tell the two apart with its end.
    expect(got.map((e) => e.endTime)).toEqual(['14:00', '14:00', '15:00', '15:00'])
    expect(got[0]!.kind).toBe('meeting · EDT 09:00')
    expect(got[2]!.kind).toBe('meeting · EST 09:00')
    expect(got.map((e) => e.zone)).toEqual(['EDT', 'EDT', 'EST', 'EST'])
  })

  it('keeps a Toronto meeting and a London one apart in the week between their changes', async () => {
    // Britain leaves BST on 2026-10-25, Toronto leaves EDT on 2026-11-01. One offset cannot be
    // right for both, which is the whole reason the zone belongs to the event.
    const ctx = await setup()
    await arrange(ctx, { ...WEEKLY, title: '多伦多' })
    await arrange(ctx, { ...WEEKLY, title: '英国', timeZone: 'Europe/London' })

    const got = await entries(ctx, '2026-10-27', '2026-10-27')
    expect(got.map((e) => [e.title, e.time])).toEqual([
      ['英国', '09:00'],
      ['多伦多', '13:00'],
    ])
  })
})

describe('editing one occurrence', () => {
  it('moves just that one, and leaves the series where it was', async () => {
    const ctx = await setup()
    const series = await arrange(ctx)
    const res = await patch(ctx, series.meetingId, {
      scope: 'one',
      recurrenceId: '2026-10-27T09:00',
      startsLocal: '2026-10-27T14:00',
    })
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json()).toMatchObject({
      recurrenceId: '2026-10-27T09:00',
      startsLocal: '2026-10-27T14:00',
      overridden: true,
    })

    const got = await listed(ctx, '?from=2026-10-20&to=2026-11-10')
    expect(got.map((o) => o.startsLocal)).toEqual([
      '2026-10-20T09:00',
      '2026-10-27T14:00',
      '2026-11-03T09:00',
      '2026-11-10T09:00',
    ])
  })

  it('moves one days away, and still finds it by the time the rule gave it', async () => {
    // Tuesday's meeting moved to Friday is still Tuesday's: an override is found by its
    // RECURRENCE-ID, not by looking near where it ended up.
    const ctx = await setup()
    const series = await arrange(ctx)
    const res = await patch(ctx, series.meetingId, {
      scope: 'one',
      recurrenceId: '2026-10-27T09:00',
      startsLocal: '2026-10-30T09:00',
    })
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json()).toMatchObject({
      recurrenceId: '2026-10-27T09:00',
      startsLocal: '2026-10-30T09:00',
    })

    const got = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/meetings/${series.meetingId}?recurrenceId=2026-10-27T09:00`,
      headers: ctx.authed,
    })
    expect(got.statusCode, got.body).toBe(200)
    expect((got.json() as MeetingOccurrence).startsLocal).toBe('2026-10-30T09:00')
  })

  it('refuses to change what belongs to the whole series', async () => {
    // A title, a place and a guest list are the SERIES'. Moving one week's meeting is not a
    // reason for it to have two titles, and a calendar that allowed it would quietly fork.
    const ctx = await setup()
    const series = await arrange(ctx)
    const res = await patch(ctx, series.meetingId, {
      scope: 'one',
      recurrenceId: '2026-10-27T09:00',
      title: '只改这次的标题',
    })
    expect(res.statusCode).toBe(422)
  })

  it('refuses a recurrence id the rule never produced', async () => {
    const ctx = await setup()
    const series = await arrange(ctx)
    const res = await patch(ctx, series.meetingId, {
      // A Wednesday, in a Tuesday series.
      scope: 'one',
      recurrenceId: '2026-10-28T09:00',
      startsLocal: '2026-10-28T14:00',
    })
    expect(res.statusCode).toBe(404)
  })

  it('cancels one week without cancelling the series', async () => {
    const ctx = await setup()
    const series = await arrange(ctx)
    const res = await cancel(ctx, series.meetingId, '?scope=one&recurrenceId=2026-10-27T09:00')
    expect(res.statusCode, res.body).toBe(204)
    expect(days(await listed(ctx, '?from=2026-10-20&to=2026-11-10'))).toEqual([
      '2026-10-20',
      '2026-11-03',
      '2026-11-10',
    ])
  })
})

describe('editing from one occurrence on', () => {
  it('splits the series, leaving the past exactly as it happened', async () => {
    const ctx = await setup()
    const series = await arrange(ctx)
    const res = await patch(ctx, series.meetingId, {
      scope: 'following',
      recurrenceId: '2026-11-03T09:00',
      startsLocal: '2026-11-04T09:00',
      rrule: 'FREQ=WEEKLY;BYDAY=WE',
    })
    expect(res.statusCode, res.body).toBe(200)
    // A NEW series: the old one still owns the Tuesdays before the split.
    expect((res.json() as MeetingOccurrence).meetingId).not.toBe(series.meetingId)

    expect(days(await listed(ctx, '?from=2026-10-20&to=2026-11-18'))).toEqual([
      '2026-10-20',
      '2026-10-27',
      '2026-11-04',
      '2026-11-11',
      '2026-11-18',
    ])
  })

  it('refuses to move the rest onto a day the rule does not fall on', async () => {
    // Wednesdays from here on, with the rule still saying Tuesday. The rule has to move with the
    // start, as it does above.
    const ctx = await setup()
    const series = await arrange(ctx)
    const res = await patch(ctx, series.meetingId, {
      scope: 'following',
      recurrenceId: '2026-11-03T09:00',
      startsLocal: '2026-11-04T09:00',
    })
    expect(res.statusCode, res.body).toBe(422)
    expect(res.json().detail).toContain('2026-11-10T09:00')
    // Nothing was split.
    expect(days(await listed(ctx, '?from=2026-10-20&to=2026-11-10'))).toEqual([
      '2026-10-20',
      '2026-10-27',
      '2026-11-03',
      '2026-11-10',
    ])
  })

  it('checks the new rule against where the new series starts, not where the old one did', async () => {
    // Daily from a Monday, then weekly on Tuesdays from the first Tuesday on.
    const ctx = await setup()
    const series = await arrange(ctx, {
      ...WEEKLY,
      startsLocal: '2026-10-19T09:00',
      rrule: 'FREQ=DAILY',
    })
    const res = await patch(ctx, series.meetingId, {
      scope: 'following',
      recurrenceId: '2026-10-20T09:00',
      rrule: 'FREQ=WEEKLY;BYDAY=TU',
    })
    expect(res.statusCode, res.body).toBe(200)
    expect(days(await listed(ctx, '?from=2026-10-19&to=2026-11-03'))).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-27',
      '2026-11-03',
    ])
  })

  it('carries the guest list into the new series', async () => {
    const ctx = await setup()
    const a = await person(ctx, '陈颖')
    const series = await arrange(ctx, { ...WEEKLY, attendeeIds: [a.id] })
    const res = await patch(ctx, series.meetingId, {
      scope: 'following',
      recurrenceId: '2026-11-03T09:00',
      startsLocal: '2026-11-03T15:00',
    })
    expect((res.json() as MeetingOccurrence).attendees.map((p) => p.name)).toEqual(['陈颖'])
  })

  it('carries the overrides on the far side of the split, and leaves the near ones', async () => {
    // A week that was already moved keeps its move, on whichever series now owns it. Leaving them
    // all behind would quietly undo a change the person made before the split.
    const ctx = await setup()
    const series = await arrange(ctx)
    // One before the split, one after.
    await patch(ctx, series.meetingId, {
      scope: 'one',
      recurrenceId: '2026-10-27T09:00',
      startsLocal: '2026-10-27T16:00',
    })
    await patch(ctx, series.meetingId, {
      scope: 'one',
      recurrenceId: '2026-11-10T09:00',
      startsLocal: '2026-11-10T17:00',
    })

    const res = await patch(ctx, series.meetingId, {
      scope: 'following',
      recurrenceId: '2026-11-03T09:00',
      durationMinutes: 30,
    })
    expect(res.statusCode, res.body).toBe(200)

    const got = await listed(ctx, '?from=2026-10-20&to=2026-11-18')
    expect(got.map((o) => o.startsLocal)).toEqual([
      '2026-10-20T09:00',
      // Kept by the OLD series.
      '2026-10-27T16:00',
      '2026-11-03T09:00',
      // Kept by the NEW one.
      '2026-11-10T17:00',
      '2026-11-17T09:00',
    ])
  })

  it('drops the far overrides when the new series starts at another time', async () => {
    // The new series' occurrences have new recurrence ids; an override keyed by an old one would
    // show as an extra meeting beside the one the rule now makes.
    const ctx = await setup()
    const series = await arrange(ctx)
    await patch(ctx, series.meetingId, {
      scope: 'one',
      recurrenceId: '2026-11-10T09:00',
      startsLocal: '2026-11-10T17:00',
    })
    const res = await patch(ctx, series.meetingId, {
      scope: 'following',
      recurrenceId: '2026-11-03T09:00',
      startsLocal: '2026-11-03T10:00',
    })
    expect(res.statusCode, res.body).toBe(200)
    const got = await listed(ctx, '?from=2026-10-20&to=2026-11-18')
    expect(got.map((o) => o.startsLocal)).toEqual([
      '2026-10-20T09:00',
      '2026-10-27T09:00',
      '2026-11-03T10:00',
      '2026-11-10T10:00',
      '2026-11-17T10:00',
    ])
  })

  it('cancels everything from one occurrence on, and keeps what came before', async () => {
    const ctx = await setup()
    const series = await arrange(ctx)
    const res = await cancel(
      ctx,
      series.meetingId,
      '?scope=following&recurrenceId=2026-11-03T09:00',
    )
    expect(res.statusCode, res.body).toBe(204)
    expect(days(await listed(ctx, '?from=2026-10-20&to=2026-11-18'))).toEqual([
      '2026-10-20',
      '2026-10-27',
    ])
  })
})

describe('editing the whole series', () => {
  it('changes every occurrence', async () => {
    const ctx = await setup()
    const series = await arrange(ctx)
    expect((await patch(ctx, series.meetingId, { title: '改了名的周会' })).statusCode).toBe(200)
    const got = await listed(ctx, '?from=2026-10-20&to=2026-11-10')
    expect(new Set(got.map((o) => o.title))).toEqual(new Set(['改了名的周会']))
  })

  it('drops the overrides when the series itself moves', async () => {
    // An override is keyed by the OLD local time, so after a move it names nothing. Keeping it
    // would leave a ghost in a schedule nobody can see it in.
    const ctx = await setup()
    const series = await arrange(ctx)
    await patch(ctx, series.meetingId, {
      scope: 'one',
      recurrenceId: '2026-10-27T09:00',
      startsLocal: '2026-10-27T14:00',
    })
    expect(
      (await patch(ctx, series.meetingId, { startsLocal: '2026-10-20T11:00' })).statusCode,
    ).toBe(200)
    const got = await listed(ctx, '?from=2026-10-20&to=2026-11-10')
    expect(new Set(got.map((o) => o.startsLocal.slice(11)))).toEqual(new Set(['11:00']))
  })

  it('refuses to move the start onto a day the rule does not fall on', async () => {
    const ctx = await setup()
    const series = await arrange(ctx)
    // A Wednesday, in a Tuesday series.
    const res = await patch(ctx, series.meetingId, { startsLocal: '2026-10-21T09:00' })
    expect(res.statusCode, res.body).toBe(422)
    expect(res.json().detail).toContain('2026-10-27T09:00')
    // With the rule moved too, it is the same series on another day.
    const moved = await patch(ctx, series.meetingId, {
      startsLocal: '2026-10-21T09:00',
      rrule: 'FREQ=WEEKLY;BYDAY=WE',
    })
    expect(moved.statusCode, moved.body).toBe(200)
    expect(days(await listed(ctx, '?from=2026-10-20&to=2026-11-04'))).toEqual([
      '2026-10-21',
      '2026-10-28',
      '2026-11-04',
    ])
  })

  it('takes a scope it cannot honour on a one-off and does the only thing there is', async () => {
    // A meeting that happens once has one occurrence, so "this one" and "the series" are the same
    // act. Refusing it would be pedantry about a distinction that does not exist.
    const ctx = await setup()
    const one = await arrange(ctx, { ...WEEKLY, rrule: null })
    const res = await patch(ctx, one.meetingId, {
      scope: 'one',
      recurrenceId: one.recurrenceId,
      title: '改了',
    })
    expect(res.statusCode, res.body).toBe(200)
    expect((res.json() as MeetingOccurrence).title).toBe('改了')
  })

  it('cancels the whole thing', async () => {
    const ctx = await setup()
    const series = await arrange(ctx)
    expect((await cancel(ctx, series.meetingId)).statusCode).toBe(204)
    expect((await cancel(ctx, series.meetingId)).statusCode).toBe(404)
    expect(await entries(ctx, '2026-10-01', '2026-12-01')).toEqual([])
  })
})

describe('windows, projects and tenants', () => {
  it("cuts the window on the ACCOUNT's calendar days", async () => {
    // 23:00 UTC on the 8th is 07:00 on the 9th in Shanghai. Asking for the 9th has to find it and
    // asking for the 8th has to miss it -- silently backwards for everyone east of UTC otherwise.
    const ctx = await setup('east@example.com')
    await ctx.db.execute(sql`update users set timezone = 'Asia/Shanghai'`)
    await arrange(ctx, {
      title: '早班会',
      startsLocal: '2026-10-09T07:00',
      timeZone: 'Asia/Shanghai',
      durationMinutes: 30,
      rrule: null,
    })
    expect((await entries(ctx, '2026-10-09', '2026-10-09')).map((e) => e.title)).toEqual(['早班会'])
    expect(await entries(ctx, '2026-10-08', '2026-10-08')).toEqual([])
  })

  it('reaches the end of a day the clocks fall back on', async () => {
    const ctx = await setup('dst@example.com')
    await ctx.db.execute(sql`update users set timezone = 'America/Toronto'`)
    await arrange(ctx, {
      title: '晚班',
      startsLocal: '2026-11-01T23:15',
      timeZone: 'America/Toronto',
      durationMinutes: 30,
      rrule: null,
    })
    expect((await listed(ctx, '?from=2026-11-01&to=2026-11-01')).map((m) => m.title)).toEqual([
      '晚班',
    ])
  })

  it('files a meeting under a project, and keeps it when the project goes', async () => {
    const ctx = await setup()
    const pid = await createProject(ctx, '找工作')
    const series = await arrange(ctx, { ...WEEKLY, rrule: null, projectId: pid })
    expect(series).toMatchObject({ projectId: pid, projectName: '找工作' })
    const page = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/links?type=project&id=${pid}`,
      headers: web(ctx),
    })
    const groups = (page.json() as LinksResponse).groups
    expect(groups.find((g) => g.type === 'meeting')?.items.map((i) => i.title)).toEqual(['周会'])

    await ctx.app.inject({ method: 'DELETE', url: `/api/v1/projects/${pid}`, headers: web(ctx) })
    const after = await listed(ctx, '?from=2026-10-20&to=2026-10-21')
    // Having met about something is history; deleting the project does not unhappen it.
    expect(after[0]).toMatchObject({ title: '周会', projectId: null, projectName: null })
  })

  it('refuses a person from another workspace, and arranges no half a meeting', async () => {
    const ctx = await setup()
    const mine = await person(ctx, '我的联系人')
    const other = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'x-ctws-client': 'web' },
      payload: { email: 'two@example.com', password: 'correct horse battery', timezone: 'UTC' },
    })
    const theirs: Harness = {
      ...ctx,
      authed: {
        'x-ctws-client': 'web',
        cookie: String(other.headers['set-cookie']).split(';')[0]!,
      },
    }
    const stranger = await person(theirs, '别人的联系人')

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/meetings',
      headers: web(ctx),
      payload: { ...WEEKLY, attendeeIds: [mine.id, stranger.id] },
    })
    expect(res.statusCode).toBe(404)
    expect(await listed(ctx, '?from=2026-10-20&to=2026-10-21')).toEqual([])
  })

  it('leaves a deleted person out rather than naming someone unfindable', async () => {
    const ctx = await setup()
    const a = await person(ctx, '走了的人')
    const series = await arrange(ctx, { ...WEEKLY, rrule: null, attendeeIds: [a.id] })
    await ctx.app.inject({ method: 'DELETE', url: `/api/v1/people/${a.id}`, headers: web(ctx) })

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/meetings/${series.meetingId}?recurrenceId=${series.recurrenceId}`,
      headers: ctx.authed,
    })
    expect((res.json() as MeetingOccurrence).attendees).toEqual([])
  })

  it('keeps one workspace out of another', async () => {
    const ctx = await setup()
    const series = await arrange(ctx)
    const other = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'x-ctws-client': 'web' },
      payload: { email: 'three@example.com', password: 'correct horse battery', timezone: 'UTC' },
    })
    const theirs: Harness = {
      ...ctx,
      authed: {
        'x-ctws-client': 'web',
        cookie: String(other.headers['set-cookie']).split(';')[0]!,
      },
    }
    const seen = await theirs.app.inject({
      method: 'GET',
      url: `/api/v1/meetings/${series.meetingId}?recurrenceId=${series.recurrenceId}`,
      headers: theirs.authed,
    })
    expect(seen.statusCode).toBe(404)
    expect((await patch(theirs, series.meetingId, { title: '改名' })).statusCode).toBe(404)
    expect((await cancel(theirs, series.meetingId)).statusCode).toBe(404)
  })
})

describe('an edit that meets a concurrent delete', () => {
  // Each edit writes from the series it read, so it must read only once it holds the row: an edit
  // that read first would act on a meeting deleted while it waited.
  const deleteUncommitted = (id: string) => (tx: Queryable) =>
    tx.execute(sql`update meetings set deleted_at = now() where id = ${id}`)

  it('does not bring a deleted meeting back from one occurrence on', async () => {
    const ctx = await setup()
    const series = await arrange(ctx)
    const res = await expectBlockedWhile(ctx, deleteUncommitted(series.meetingId), () =>
      patch(ctx, series.meetingId, {
        scope: 'following',
        recurrenceId: '2026-11-03T09:00',
        title: '新周会',
      }),
    )
    expect(res.statusCode).toBe(404)
    expect(await listed(ctx, '?from=2026-10-20&to=2026-12-31')).toEqual([])
  })

  it('does not cancel occurrences of a meeting deleted meanwhile', async () => {
    const ctx = await setup()
    const series = await arrange(ctx)
    const res = await expectBlockedWhile(ctx, deleteUncommitted(series.meetingId), () =>
      cancel(ctx, series.meetingId, '?scope=one&recurrenceId=2026-10-27T09:00'),
    )
    expect(res.statusCode).toBe(404)
  })
})
