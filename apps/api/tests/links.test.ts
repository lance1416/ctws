import type { ContactResponse, MeetingOccurrence, ReadingItemResponse } from '@ctws/contracts'
import { afterEach, describe, expect, it } from 'vitest'
import { appWithUser, createProject, setupWith, type TaskCtx, web } from './helpers/tasks'

/**
 * 边表 -- what one table holding every relationship makes newly possible to get wrong.
 *
 * Each module used to own a column or a join table of its own, so one kind of relationship could
 * not reach another's storage even by accident. They now share `links`, and a write that forgot
 * to say WHICH kind it replaces would quietly take the others with it: setting a meeting's guest
 * list would unfile it from its project, and the module's own tests would all still pass, because
 * each of them looks at one kind at a time.
 */

const cleanups: (() => Promise<void>)[] = []

const setup = (email: string) => setupWith(cleanups, email)
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

async function post<T>(ctx: TaskCtx, url: string, payload: Record<string, unknown>): Promise<T> {
  const res = await ctx.app.inject({ method: 'POST', url, headers: web(ctx), payload })
  if (res.statusCode !== 201) throw new Error(`${url}: ${res.statusCode} ${res.body}`)
  return res.json() as T
}

const patch = (ctx: TaskCtx, url: string, payload: Record<string, unknown>) =>
  ctx.app.inject({ method: 'PATCH', url, headers: web(ctx), payload })

describe('one object, several kinds of edge', () => {
  it('replaces only the kind being written, and leaves the others where they are', async () => {
    const ctx = await setup('edges@example.com')
    const project = await createProject(ctx, '找工作')
    const person = await post<ContactResponse>(ctx, '/api/v1/contacts', { name: '陈颖' })
    const meeting = await post<MeetingOccurrence>(ctx, '/api/v1/meetings', {
      title: '二面',
      startsLocal: '2026-10-20T21:00',
      timeZone: 'America/Toronto',
      durationMinutes: 60,
      projectId: project,
      attendeeIds: [person.id],
    })
    expect(meeting.projectId).toBe(project)
    expect(meeting.attendees.map((a) => a.id)).toEqual([person.id])

    // Writing the guest list must not unfile the meeting.
    const other = await post<ContactResponse>(ctx, '/api/v1/contacts', { name: '另一个人' })
    const guests = await patch(ctx, `/api/v1/meetings/${meeting.meetingId}`, {
      scope: 'all',
      attendeeIds: [person.id, other.id],
    })
    expect(guests.statusCode, guests.body).toBe(200)
    const afterGuests = guests.json() as MeetingOccurrence
    expect(afterGuests.projectId).toBe(project)
    expect(afterGuests.attendees.map((a) => a.name).sort()).toEqual(['另一个人', '陈颖'])

    // And refiling it must not empty the guest list.
    const elsewhere = await createProject(ctx, '开源')
    const moved = await patch(ctx, `/api/v1/meetings/${meeting.meetingId}`, {
      scope: 'all',
      projectId: elsewhere,
    })
    expect(moved.statusCode, moved.body).toBe(200)
    const afterMove = moved.json() as MeetingOccurrence
    expect(afterMove.projectId).toBe(elsewhere)
    expect(afterMove.attendees).toHaveLength(2)
  })

  it('keeps each kind of thing to its own edges, though they share one table', async () => {
    const ctx = await setup('kinds@example.com')
    const project = await createProject(ctx, '找工作')
    // A reading item and a meeting created in that order get ids from the same clock; nothing but
    // the type on the edge tells one from the other.
    const reading = await post<ReadingItemResponse>(ctx, '/api/v1/reading', {
      kind: 'link',
      url: 'https://example.test/a',
      projectId: project,
    })
    const meeting = await post<MeetingOccurrence>(ctx, '/api/v1/meetings', {
      title: '二面',
      startsLocal: '2026-10-20T21:00',
      timeZone: 'America/Toronto',
      durationMinutes: 60,
      projectId: project,
    })

    // Unfiling the meeting leaves the reading item filed.
    const unfiled = await patch(ctx, `/api/v1/meetings/${meeting.meetingId}`, {
      scope: 'all',
      projectId: null,
    })
    expect(unfiled.statusCode, unfiled.body).toBe(200)
    expect((unfiled.json() as MeetingOccurrence).projectId).toBeNull()

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/reading?projectId=${project}`,
      headers: web(ctx),
    })
    expect(res.statusCode, res.body).toBe(200)
    const items = (res.json() as { items: ReadingItemResponse[] }).items
    expect(items.map((i) => i.id)).toEqual([reading.id])
  })

  it('keeps one workspace edges out of another, though both are rows in one table', async () => {
    // ONE app, two users: two `appWithUser()`s would be two databases, and the isolation would
    // hold trivially.
    const ctx = await setup('mine@example.com')
    const them = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'x-ctws-client': 'web' },
      payload: { email: 'theirs@example.com', password: 'correct horse battery', timezone: 'UTC' },
    })
    expect(them.statusCode, them.body).toBe(201)
    const theirHeaders = {
      'x-ctws-client': 'web',
      cookie: String(them.headers['set-cookie']).split(';')[0]!,
    }

    const myProject = await createProject(ctx, '找工作')
    const myPerson = await post<ContactResponse>(ctx, '/api/v1/contacts', {
      name: '陈颖',
      projectIds: [myProject],
    })

    // Their list is their own, and names none of my edges.
    const theirList = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/contacts',
      headers: theirHeaders,
    })
    expect(theirList.statusCode, theirList.body).toBe(200)
    expect((theirList.json() as { contacts: ContactResponse[] }).contacts).toEqual([])

    // My project id is a real id; filtering THEIR list by it must still find nothing rather than
    // reaching across through an edge that carries no workspace of its own.
    const reached = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/contacts?projectId=${myProject}`,
      headers: theirHeaders,
    })
    expect([200, 404]).toContain(reached.statusCode)
    if (reached.statusCode === 200) {
      expect((reached.json() as { contacts: ContactResponse[] }).contacts).toEqual([])
    }

    // And mine is exactly as I left it.
    const after = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/contacts',
      headers: web(ctx),
    })
    expect(after.statusCode, after.body).toBe(200)
    const mine = (after.json() as { contacts: ContactResponse[] }).contacts
    expect(mine.map((c) => c.id)).toEqual([myPerson.id])
    expect(mine[0]!.projects.map((p) => p.id)).toEqual([myProject])
  })
})
