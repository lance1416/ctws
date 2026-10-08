import type { CalendarEntry, ContactResponse, MeetingResponse } from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { appWithUser, createProject, type TaskCtx } from './helpers/tasks'

/**
 * 会议 -- the fourth module, on iCalendar's `VEVENT` (RFC 5545).
 *
 * The two claims worth pinning are the ones a hand-rolled event model gets wrong: a meeting is
 * two INSTANTS and the day it belongs to is the account's, not the server's; and the end has to
 * come after the start even when only ONE of them is moved, which the contract cannot check on
 * its own because it never sees the stored half.
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

async function arrange(ctx: TaskCtx, payload: Record<string, unknown>): Promise<MeetingResponse> {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/meetings',
    headers: web(ctx),
    payload,
  })
  if (res.statusCode !== 201) throw new Error(`arrange: ${res.statusCode} ${res.body}`)
  return res.json() as MeetingResponse
}

const patch = (ctx: TaskCtx, id: string, payload: Record<string, unknown>) =>
  ctx.app.inject({ method: 'PATCH', url: `/api/v1/meetings/${id}`, headers: web(ctx), payload })

async function person(ctx: TaskCtx, name: string): Promise<ContactResponse> {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/contacts',
    headers: web(ctx),
    payload: { name },
  })
  expect(res.statusCode, res.body).toBe(201)
  return res.json() as ContactResponse
}

async function entries(ctx: TaskCtx, from: string, to: string): Promise<CalendarEntry[]> {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/api/v1/meetings/calendar?from=${from}&to=${to}`,
    headers: ctx.authed,
  })
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as { entries: CalendarEntry[] }).entries
}

const AT_TWO = '2026-10-08T06:00:00.000Z'
const AT_THREE = '2026-10-08T07:00:00.000Z'

describe('meetings', () => {
  it('holds two instants and the people in the room', async () => {
    const ctx = await setup()
    const a = await person(ctx, '陈颖')
    const b = await person(ctx, '李雷')
    const meeting = await arrange(ctx, {
      title: '二面',
      startsAt: AT_TWO,
      endsAt: AT_THREE,
      location: 'Zoom',
      attendeeIds: [a.id, b.id],
    })
    expect(meeting).toMatchObject({ title: '二面', location: 'Zoom' })
    expect(meeting.attendees.map((p) => p.name)).toEqual(['李雷', '陈颖'])
  })

  it('refuses a meeting that ends before it starts', async () => {
    const ctx = await setup()
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/meetings',
      headers: web(ctx),
      payload: { title: '倒着开', startsAt: AT_THREE, endsAt: AT_TWO },
    })
    expect(res.statusCode).toBe(400)
  })

  it('refuses a move that drags one end past the other', async () => {
    // THE RULE THE CONTRACT CANNOT KEEP. A patch carrying only `startsAt` is checked against the
    // STORED end, which the client never sent and the schema never sees.
    const ctx = await setup()
    const meeting = await arrange(ctx, { title: '例会', startsAt: AT_TWO, endsAt: AT_THREE })
    const res = await patch(ctx, meeting.id, { startsAt: '2026-10-08T08:00:00.000Z' })
    expect(res.statusCode).toBe(409)
    // And nothing moved.
    expect((await patch(ctx, meeting.id, { title: '例会' })).statusCode).toBe(200)
    const after = (await patch(ctx, meeting.id, { title: '例会' })).json() as MeetingResponse
    expect(after.startsAt).toBe(AT_TWO)
  })

  it('puts a meeting on the day it starts IN THE ACCOUNT ZONE, with its time', async () => {
    // 23:00 UTC is already tomorrow in Shanghai. The square a meeting lands on and the clock it
    // shows are the same question, and both are the server's to answer.
    const ctx = await setup('east@example.com')
    await ctx.db.execute(sql`update users set timezone = 'Asia/Shanghai'`)
    await arrange(ctx, {
      title: '深夜同步',
      startsAt: '2026-10-08T23:00:00.000Z',
      endsAt: '2026-10-08T23:30:00.000Z',
    })

    const [entry] = await entries(ctx, '2026-10-01', '2026-10-31')
    expect(entry).toMatchObject({ day: '2026-10-09', time: '07:00', kind: '会议' })
  })

  it("cuts the window on the ACCOUNT's calendar days", async () => {
    // 23:00 UTC on the 8th is 07:00 on the 9th in Shanghai. Asking for 「9 号」 has to find it and
    // asking for 「8 号」 has to miss it -- a window compared against the server's days would get
    // both backwards, for everyone east of UTC, silently.
    const ctx = await setup('east2@example.com')
    await ctx.db.execute(sql`update users set timezone = 'Asia/Shanghai'`)
    await arrange(ctx, {
      title: '早班会',
      startsAt: '2026-10-08T23:00:00.000Z',
      endsAt: '2026-10-08T23:30:00.000Z',
    })

    expect((await entries(ctx, '2026-10-09', '2026-10-09')).map((e) => e.title)).toEqual(['早班会'])
    expect(await entries(ctx, '2026-10-08', '2026-10-08')).toEqual([])
  })

  it('reports a window in the account calendar days, not in instants', async () => {
    const ctx = await setup()
    await arrange(ctx, { title: '在窗口里', startsAt: AT_TWO, endsAt: AT_THREE })
    await arrange(ctx, {
      title: '下个月',
      startsAt: '2026-11-08T06:00:00.000Z',
      endsAt: '2026-11-08T07:00:00.000Z',
    })
    expect((await entries(ctx, '2026-10-01', '2026-10-31')).map((e) => e.title)).toEqual([
      '在窗口里',
    ])
  })

  it('lists earliest first, because a diary is read forwards', async () => {
    const ctx = await setup()
    await arrange(ctx, {
      title: '下午的',
      startsAt: '2026-10-08T08:00:00.000Z',
      endsAt: '2026-10-08T09:00:00.000Z',
    })
    await arrange(ctx, { title: '上午的', startsAt: AT_TWO, endsAt: AT_THREE })

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/meetings',
      headers: ctx.authed,
    })
    expect((res.json() as { meetings: MeetingResponse[] }).meetings.map((m) => m.title)).toEqual([
      '上午的',
      '下午的',
    ])
  })

  it('replaces the whole guest list, leaving nobody behind', async () => {
    const ctx = await setup()
    const a = await person(ctx, '陈颖')
    const b = await person(ctx, '李雷')
    const meeting = await arrange(ctx, {
      title: '例会',
      startsAt: AT_TWO,
      endsAt: AT_THREE,
      attendeeIds: [a.id, b.id],
    })
    const res = await patch(ctx, meeting.id, { attendeeIds: [b.id] })
    expect(res.statusCode).toBe(200)
    expect((res.json() as MeetingResponse).attendees.map((p) => p.name)).toEqual(['李雷'])
  })

  it('leaves a deleted person out rather than naming someone unfindable', async () => {
    const ctx = await setup()
    const a = await person(ctx, '走了的人')
    const meeting = await arrange(ctx, {
      title: '例会',
      startsAt: AT_TWO,
      endsAt: AT_THREE,
      attendeeIds: [a.id],
    })
    await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/contacts/${a.id}`,
      headers: web(ctx),
    })
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/meetings/${meeting.id}`,
      headers: ctx.authed,
    })
    expect((res.json() as MeetingResponse).attendees).toEqual([])
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
    const theirs: TaskCtx = {
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
      // One of mine and one of theirs: refused WHOLE, not arranged with the half that was visible.
      payload: {
        title: '不该成的会',
        startsAt: AT_TWO,
        endsAt: AT_THREE,
        attendeeIds: [mine.id, stranger.id],
      },
    })
    expect(res.statusCode).toBe(404)
    const listed = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/meetings',
      headers: ctx.authed,
    })
    expect((listed.json() as { meetings: MeetingResponse[] }).meetings).toEqual([])
  })

  it('files a meeting under a project, and keeps it when the project goes', async () => {
    const ctx = await setup()
    const pid = await createProject(ctx, '找工作')
    const meeting = await arrange(ctx, {
      title: '二面',
      startsAt: AT_TWO,
      endsAt: AT_THREE,
      projectId: pid,
    })
    expect(meeting).toMatchObject({ projectId: pid, projectName: '找工作' })

    await ctx.app.inject({ method: 'DELETE', url: `/api/v1/projects/${pid}`, headers: web(ctx) })
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/meetings/${meeting.id}`,
      headers: ctx.authed,
    })
    // Having met about something is history, and deleting the project does not unhappen it.
    expect(res.json()).toMatchObject({ title: '二面', projectId: null, projectName: null })
  })

  it('keeps one workspace out of another', async () => {
    const ctx = await setup()
    const meeting = await arrange(ctx, { title: '我的会', startsAt: AT_TWO, endsAt: AT_THREE })
    const other = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'x-ctws-client': 'web' },
      payload: { email: 'three@example.com', password: 'correct horse battery', timezone: 'UTC' },
    })
    const theirs: TaskCtx = {
      ...ctx,
      authed: {
        'x-ctws-client': 'web',
        cookie: String(other.headers['set-cookie']).split(';')[0]!,
      },
    }
    const seen = await theirs.app.inject({
      method: 'GET',
      url: `/api/v1/meetings/${meeting.id}`,
      headers: theirs.authed,
    })
    expect(seen.statusCode).toBe(404)
    expect((await patch(theirs, meeting.id, { title: '改名' })).statusCode).toBe(404)
  })

  it('hides a cancelled meeting from every read, and refuses to cancel it twice', async () => {
    const ctx = await setup()
    const meeting = await arrange(ctx, { title: '取消了', startsAt: AT_TWO, endsAt: AT_THREE })
    const cancel = () =>
      ctx.app.inject({ method: 'DELETE', url: `/api/v1/meetings/${meeting.id}`, headers: web(ctx) })
    expect((await cancel()).statusCode).toBe(204)
    expect((await cancel()).statusCode).toBe(404)
    expect(await entries(ctx, '2026-10-01', '2026-10-31')).toEqual([])
  })
})
