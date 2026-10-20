import { afterEach, describe, expect, it } from 'vitest'
import { createMeeting, createPerson, createProject, createTask } from '../helpers/builders'
import { appWithUser, type Harness, secondUser } from '../helpers/harness'

/**
 * A THING'S TIMELINE (FR-044, FR-045): its own changes, newest first, read through the shell so
 * every kind of thing answers the same way. Other kinds of entry (messages, meetings, notes) join
 * as their modules arrive; this file covers the log itself and the page.
 */
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

type Entry = { kind: string; at: string; event: { type: string; payload: unknown } }

async function timeline(ctx: Harness, type: string, id: string, extra = '') {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/api/v1/timeline?type=${type}&id=${id}${extra}`,
    headers: ctx.authed,
  })
  return {
    status: res.statusCode,
    body: res.json() as { entries: Entry[]; page: { nextCursor: string | null } },
  }
}

describe('GET /timeline', () => {
  it("lists a task's changes newest first, with the old and new values", async () => {
    const ctx = await appWithUser()
    cleanups.push(ctx.stop)
    const project = await createProject(ctx, 'P')
    const task = await createTask(ctx, project, 'Write the RFC')
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/tasks/${task}`,
      headers: ctx.authed,
      payload: { dueAt: '2026-10-24T18:00:00+00:00' },
    })
    expect(res.statusCode, res.body).toBe(200)

    const { status, body } = await timeline(ctx, 'task', task)
    expect(status).toBe(200)
    expect(body.entries.map((e) => [e.kind, e.event.type])).toEqual([
      ['change', 'due_changed'],
      ['change', 'created'],
    ])
    expect(body.entries[0]?.event.payload).toEqual({
      from: null,
      to: '2026-10-24T18:00:00.000Z',
    })
    expect(body.page.nextCursor).toBeNull()
  })

  it('reads a page at a time', async () => {
    const ctx = await appWithUser()
    cleanups.push(ctx.stop)
    const project = await createProject(ctx, 'P')
    const task = await createTask(ctx, project, 'a')
    for (const title of ['b', 'c', 'd']) {
      await ctx.app.inject({
        method: 'PATCH',
        url: `/api/v1/tasks/${task}`,
        headers: ctx.authed,
        payload: { title },
      })
    }
    const first = await timeline(ctx, 'task', task, '&limit=3')
    expect(first.body.entries).toHaveLength(3)
    expect(first.body.page.nextCursor).not.toBeNull()
    const rest = await timeline(ctx, 'task', task, `&limit=3&cursor=${first.body.page.nextCursor}`)
    expect(rest.body.entries.map((e) => e.event.type)).toEqual(['created'])
    expect(rest.body.page.nextCursor).toBeNull()
  })

  it('neither repeats nor skips an entry logged while the reader scrolls', async () => {
    const ctx = await appWithUser()
    cleanups.push(ctx.stop)
    const project = await createProject(ctx, 'P')
    const task = await createTask(ctx, project, 'a')
    const rename = (title: string) =>
      ctx.app.inject({
        method: 'PATCH',
        url: `/api/v1/tasks/${task}`,
        headers: ctx.authed,
        payload: { title },
      })
    for (const title of ['b', 'c', 'd']) await rename(title)
    const first = await timeline(ctx, 'task', task, '&limit=2')
    expect(first.body.entries.map((e) => e.event.payload)).toEqual([
      { from: 'c', to: 'd' },
      { from: 'b', to: 'c' },
    ])
    // Something happens between the two reads: an offset would now show `b -> c` again.
    await rename('e')
    const rest = await timeline(ctx, 'task', task, `&limit=2&cursor=${first.body.page.nextCursor}`)
    expect(rest.body.entries.map((e) => e.event.type)).toEqual(['title_changed', 'created'])
    expect(rest.body.entries[0]!.event.payload).toEqual({ from: 'a', to: 'b' })
    expect(rest.body.page.nextCursor).toBeNull()
  })

  it("refuses another workspace's thing as not found", async () => {
    const ctx = await appWithUser()
    cleanups.push(ctx.stop)
    const project = await createProject(ctx, 'P')
    const task = await createTask(ctx, project, 'mine')
    const other = await secondUser(ctx)
    expect((await timeline(other, 'task', task)).status).toBe(404)
  })

  it('refuses a kind of entry it does not know', async () => {
    const ctx = await appWithUser()
    cleanups.push(ctx.stop)
    const project = await createProject(ctx, 'P')
    const task = await createTask(ctx, project, 'mine')
    expect((await timeline(ctx, 'task', task, '&kinds=gossip')).status).toBe(400)
  })
})

describe('paging through a long timeline (BUG-002, BUG-003)', () => {
  it('reads every entry once across three pages, and says when there are no more', async () => {
    const ctx = await appWithUser()
    cleanups.push(ctx.stop)
    const project = await createProject(ctx, 'P')
    const task = await createTask(ctx, project, 't0')
    for (let i = 1; i <= 30; i++) {
      await ctx.app.inject({
        method: 'PATCH',
        url: `/api/v1/tasks/${task}`,
        headers: ctx.authed,
        payload: { title: `t${i}` },
      })
    }
    // 31 entries: created, then 30 renames. Pages of 7: 7, 7, 7, 7, 3.
    const seen: string[] = []
    let cursor: string | null = null
    let pages = 0
    do {
      const page = await timeline(ctx, 'task', task, `&limit=7${cursor ? `&cursor=${cursor}` : ''}`)
      expect(page.status).toBe(200)
      seen.push(
        ...page.body.entries.map((e) => e.event.type + ':' + JSON.stringify(e.event.payload)),
      )
      cursor = page.body.page.nextCursor
      pages += 1
    } while (cursor)
    expect(pages).toBe(5)
    expect(seen).toHaveLength(31)
    expect(new Set(seen).size).toBe(31)
    expect(seen.at(-1)).toContain('created')
  })

  it('refuses a cursor it did not give out', async () => {
    const ctx = await appWithUser()
    cleanups.push(ctx.stop)
    const project = await createProject(ctx, 'P')
    const task = await createTask(ctx, project, 't')
    expect((await timeline(ctx, 'task', task, '&cursor=garbage')).status).toBe(400)
    expect((await timeline(ctx, 'task', task, '&cursor=2026-10-20T00:00:00.000Z')).status).toBe(400)
  })
})

describe('the kinds of entry (BUG-001, BUG-009)', () => {
  it('shows a person the meetings they attended, and the sentences that mention them', async () => {
    const ctx = await appWithUser()
    cleanups.push(ctx.stop)
    const project = await createProject(ctx, 'P')
    const mira = await createPerson(ctx, { name: 'Mira Chen' })
    const task = await createTask(ctx, project, 'Prep', undefined, {
      notes: `Ask [@Mira](ctws://person/${mira.id}) about the loop. Then apply.`,
    })
    // A weekly series that began three weeks before now: three occurrences have happened.
    const now = new Date()
    const start = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000)
    const startsLocal = start.toISOString().slice(0, 16)
    const meeting = await createMeeting(ctx, {
      title: 'Sync',
      startsLocal,
      timeZone: 'UTC',
      durationMinutes: 30,
      rrule: 'FREQ=WEEKLY',
      projectId: project,
      attendeeIds: [mira.id],
    })
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/timeline?type=person&id=${mira.id}`,
      headers: ctx.authed,
    })
    expect(res.statusCode, res.body).toBe(200)
    const entries = res.json().entries as {
      kind: string
      at: string
      meeting?: { title: string }
      excerpt?: string
      from?: { title: string }
    }[]
    expect(entries.filter((e) => e.kind === 'meeting').map((e) => e.meeting!.title)).toEqual([
      'Sync',
      'Sync',
      'Sync',
      'Sync',
    ])
    expect(entries.find((e) => e.kind === 'mention')).toMatchObject({
      excerpt: `Ask [@Mira](ctws://person/${mira.id}) about the loop.`,
      from: { type: 'task', id: task, title: 'Prep' },
    })
    // Only the kinds asked for.
    const only = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/timeline?type=person&id=${mira.id}&kinds=meeting`,
      headers: ctx.authed,
    })
    expect(new Set((only.json().entries as { kind: string }[]).map((e) => e.kind))).toEqual(
      new Set(['meeting']),
    )
    // The project held the series, so it has the same occurrences.
    const onProject = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/timeline?type=project&id=${project}&kinds=meeting`,
      headers: ctx.authed,
    })
    expect(onProject.json().entries).toHaveLength(4)
    expect(onProject.json().entries[0].meeting.meetingId).toBe(meeting.meetingId)
  })

  it("puts a meeting's note on the day it was held, on the project's timeline too", async () => {
    const ctx = await appWithUser()
    cleanups.push(ctx.stop)
    const project = await createProject(ctx, 'P')
    const meeting = await createMeeting(ctx, {
      title: 'Review',
      startsLocal: '2026-03-02T09:00',
      timeZone: 'Europe/London',
      durationMinutes: 30,
      projectId: project,
    })
    const note = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/notes',
      headers: ctx.authed,
      payload: {
        body: 'Agreed.',
        anchor: { type: 'meeting', id: meeting.meetingId, occurrenceId: '2026-03-02T09:00' },
      },
    })
    expect(note.statusCode, note.body).toBe(201)
    for (const [type, id] of [
      ['meeting', meeting.meetingId],
      ['project', project],
    ] as const) {
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/v1/timeline?type=${type}&id=${id}&kinds=note`,
        headers: ctx.authed,
      })
      expect(res.json().entries).toMatchObject([{ kind: 'note', at: '2026-03-02T09:00:00.000Z' }])
    }
  })
})
