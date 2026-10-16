import type {
  LinksResponse,
  MeetingSeries,
  PersonResponse,
  ReadingItemResponse,
} from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { setupWith, type Harness, web, secondUser } from '../helpers/harness'
import { createProject, createMeeting, createPerson, createReading } from '../helpers/builders'

/**
 * THE EDGE TABLE -- what one table holding every relationship makes possible to get wrong.
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

const patch = (ctx: Harness, url: string, payload: Record<string, unknown>) =>
  ctx.app.inject({ method: 'PATCH', url, headers: web(ctx), payload })

describe('one object, several kinds of edge', () => {
  it('replaces only the kind being written, and leaves the others where they are', async () => {
    const ctx = await setup('edges@example.com')
    const project = await createProject(ctx, '找工作')
    const person = await createPerson(ctx, { name: '陈颖' })
    const meeting = await createMeeting(ctx, {
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
    const other = await createPerson(ctx, { name: '另一个人' })
    const guests = await patch(ctx, `/api/v1/meetings/${meeting.meetingId}`, {
      attendeeIds: [person.id, other.id],
    })
    expect(guests.statusCode, guests.body).toBe(200)
    const afterGuests = guests.json() as MeetingSeries
    expect(afterGuests.projectId).toBe(project)
    expect(afterGuests.attendees.map((a) => a.name).sort()).toEqual(['另一个人', '陈颖'])

    // And refiling it must not empty the guest list.
    const elsewhere = await createProject(ctx, '开源')
    const moved = await patch(ctx, `/api/v1/meetings/${meeting.meetingId}`, {
      projectId: elsewhere,
    })
    expect(moved.statusCode, moved.body).toBe(200)
    const afterMove = moved.json() as MeetingSeries
    expect(afterMove.projectId).toBe(elsewhere)
    expect(afterMove.attendees).toHaveLength(2)
  })

  it('keeps each kind of thing to its own edges, though they share one table', async () => {
    const ctx = await setup('kinds@example.com')
    const project = await createProject(ctx, '找工作')
    // A reading item and a meeting created in that order get ids from the same clock; nothing but
    // the type on the edge tells one from the other.
    const reading = await createReading(ctx, {
      kind: 'link',
      url: 'https://example.test/a',
    })
    const filed = await patch(ctx, `/api/v1/reading/${reading.id}`, { projectId: project })
    expect(filed.statusCode, filed.body).toBe(200)
    const meeting = await createMeeting(ctx, {
      title: '二面',
      startsLocal: '2026-10-20T21:00',
      timeZone: 'America/Toronto',
      durationMinutes: 60,
      projectId: project,
    })

    // Unfiling the meeting leaves the reading item filed.
    const unfiled = await patch(ctx, `/api/v1/meetings/${meeting.meetingId}`, {
      projectId: null,
    })
    expect(unfiled.statusCode, unfiled.body).toBe(200)
    expect((unfiled.json() as MeetingSeries).projectId).toBeNull()

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/links?type=project&id=${project}`,
      headers: web(ctx),
    })
    expect(res.statusCode, res.body).toBe(200)
    const groups = (res.json() as LinksResponse).groups
    expect(groups.map((g) => g.type)).toEqual(['reading'])
    expect(groups[0]!.items.map((i) => i.id)).toEqual([reading.id])
  })

  it('keeps one workspace edges out of another, though both are rows in one table', async () => {
    // ONE app, two users: two `appWithUser()`s would be two databases, and the isolation would
    // hold trivially.
    const ctx = await setup('mine@example.com')
    const theirHeaders = (await secondUser(ctx, 'theirs@example.com')).authed

    const myProject = await createProject(ctx, '找工作')
    const myPerson = await createPerson(ctx, {
      name: '陈颖',
      projectIds: [myProject],
    })

    // Their list is their own, and names none of my edges.
    const theirList = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/people',
      headers: theirHeaders,
    })
    expect(theirList.statusCode, theirList.body).toBe(200)
    expect((theirList.json() as { people: PersonResponse[] }).people).toEqual([])

    // My project id is a real id; reading its edges from THEIR session must find nothing rather
    // than reaching across through an edge row.
    const reached = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/links?type=project&id=${myProject}`,
      headers: theirHeaders,
    })
    expect(reached.statusCode, reached.body).toBe(404)

    // Nor does my link's own id reach it, to read or to remove.
    const ours = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/links?type=project&id=${myProject}`,
      headers: web(ctx),
    })
    const linkId = (ours.json() as LinksResponse).groups[0]!.items[0]!.linkId
    for (const method of ['GET', 'DELETE'] as const) {
      const res = await ctx.app.inject({
        method,
        url: `/api/v1/links/${linkId}`,
        headers: theirHeaders,
      })
      expect(res.statusCode, method).toBe(404)
    }

    // And mine is exactly as I left it.
    const after = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/people',
      headers: web(ctx),
    })
    expect(after.statusCode, after.body).toBe(200)
    const mine = (after.json() as { people: PersonResponse[] }).people
    expect(mine.map((c) => c.id)).toEqual([myPerson.id])
    expect(mine[0]!.projects.map((p) => p.id)).toEqual([myProject])
  })

  it('files a thing only under a project of its own workspace, whatever an edge row says', async () => {
    const ctx = await setup('filer@example.com')
    const theirProject = await createProject(await secondUser(ctx), 'Theirs')
    const person = await createPerson(ctx, { name: 'Ying' })
    const book = await createReading(ctx, {
      kind: 'book',
      title: 'Middlemarch',
    })

    // No write path makes these rows; the reads must not trust them if one ever did. One edge sits
    // in my workspace pointing at their project, one sits in theirs pointing from my book.
    await ctx.db.execute(sql`
      insert into links (id, workspace_id, from_type, from_id, to_type, to_id, kind)
      select gen_random_uuid(), workspace_id, 'person', id, 'project', ${theirProject}, 'belongs'
      from people where id = ${person.id}
    `)
    await ctx.db.execute(sql`
      insert into links (id, workspace_id, from_type, from_id, to_type, to_id, kind)
      select gen_random_uuid(), workspace_id, 'reading', ${book.id}, 'project', ${theirProject}, 'belongs'
      from projects where id = ${theirProject}
    `)

    const people = await ctx.app.inject({ method: 'GET', url: '/api/v1/people', headers: web(ctx) })
    expect((people.json() as { people: PersonResponse[] }).people[0]!.projects).toEqual([])
    const reading = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/reading',
      headers: web(ctx),
    })
    expect((reading.json() as { reading: ReadingItemResponse[] }).reading[0]!.projectId).toBeNull()
    const unfiled = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/reading?unfiled=true',
      headers: web(ctx),
    })
    expect((unfiled.json() as { reading: ReadingItemResponse[] }).reading).toHaveLength(1)
  })
})
