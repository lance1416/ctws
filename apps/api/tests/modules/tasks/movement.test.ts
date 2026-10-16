import type { ProjectId, WorkspaceId } from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { listProjectMovement } from '../../../src/modules/tasks/queries/movement'
import { appWithUser, createProject, createTask, type Harness } from '../../helpers/harness'

/**
 * MOVEMENT's server half: per-project counts and movement, in one query, through the tenant
 * chokepoint.
 *
 * The numbers here are the only ones on the workbench that no other endpoint already reports, so
 * they get their own guards: the per-project correlation (a subquery that correlates a row to
 * itself counts zero and says nothing about it), the week boundary in the user's timezone rather
 * than the server's, and the fact that activity is read from the EVENT LOG -- which is what makes "this has been quiet for nine days" mean anything, because a
 * reorder writes no event by design.
 */

let ctx: Harness
let workspaceId: WorkspaceId
let otherAuthed: Record<string, string>

beforeAll(async () => {
  ctx = await appWithUser('movement@example.com')
  workspaceId = (
    (
      await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: ctx.authed })
    ).json() as {
      workspaceId: WorkspaceId
    }
  ).workspaceId
  // A SECOND user on the SAME app and database: two `appWithUser()` calls would be two unrelated
  // databases and any isolation assertion between them would pass trivially.
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    headers: { 'x-ctws-client': 'web' },
    payload: { email: 'other@example.com', password: 'correct horse battery', timezone: 'UTC' },
  })
  expect(res.statusCode).toBe(201)
  otherAuthed = { 'x-ctws-client': 'web', cookie: String(res.headers['set-cookie']).split(';')[0]! }
}, 180_000)

afterAll(async () => {
  await ctx?.stop()
})

type Row = {
  projectId: ProjectId
  projectName: string
  doneThisWeek: number
  remaining: number
  overdue: number
  lastActivityOn: string | null
  quietDays: number | null
  nextDueOn: string | null
}

async function movement(headers = ctx.authed): Promise<Row[]> {
  const res = await ctx.app.inject({
    method: 'GET',
    url: '/api/v1/tasks/movement',
    headers,
  })
  expect(res.statusCode).toBe(200)
  return res.json().projects as Row[]
}

const rowFor = (rows: Row[], id: string): Row => {
  const r = rows.find((x) => x.projectId === id)
  expect(r, `project ${id} in the movement list`).toBeDefined()
  return r!
}

/** Sets a deadline through the real API, so the contract's own coercion is what stores it. */
async function dueAt(id: string, iso: string) {
  const res = await ctx.app.inject({
    method: 'PATCH',
    url: `/api/v1/tasks/${id}`,
    headers: ctx.authed,
    payload: { dueAt: iso },
  })
  expect(res.statusCode).toBe(200)
}

/** Finishes through the real API (so `completed_at` is set by the service), then pins the instant. */
async function finishAt(id: string, at: string) {
  const res = await ctx.app.inject({
    method: 'PATCH',
    url: `/api/v1/tasks/${id}`,
    headers: ctx.authed,
    payload: { status: 'done' },
  })
  expect(res.statusCode).toBe(200)
  await ctx.db.execute(sql`update tasks set completed_at = ${at}::timestamptz where id = ${id}`)
}

describe('GET /tasks/movement', () => {
  it('requires authentication', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/tasks/movement',
      headers: { 'x-ctws-client': 'web' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('counts open work PER PROJECT, not across the workspace', async () => {
    const few = await createProject(ctx, 'few')
    const many = await createProject(ctx, 'many')
    await createTask(ctx, few, 'f1')
    for (const t of ['m1', 'm2', 'm3']) await createTask(ctx, many, t)

    const rows = await movement()
    // The two counts must DIFFER and both be non-zero: a subquery that correlated a task to
    // itself returns 0 everywhere, and one that forgot the project filter returns the same
    // workspace-wide total for both. Only two different non-zero numbers rule out both.
    expect(rowFor(rows, few).remaining).toBe(1)
    expect(rowFor(rows, many).remaining).toBe(3)
  })

  it('leaves finished, cancelled and deleted tasks out of what is open', async () => {
    const pid = await createProject(ctx, 'leftovers')
    const open = await createTask(ctx, pid, 'open')
    const done = await createTask(ctx, pid, 'done')
    const cancelled = await createTask(ctx, pid, 'cancelled')
    const gone = await createTask(ctx, pid, 'gone')
    for (const [id, status] of [
      [done, 'done'],
      [cancelled, 'cancelled'],
    ] as const) {
      expect(
        (
          await ctx.app.inject({
            method: 'PATCH',
            url: `/api/v1/tasks/${id}`,
            headers: ctx.authed,
            payload: { status },
          })
        ).statusCode,
      ).toBe(200)
    }
    expect(
      (
        await ctx.app.inject({
          method: 'DELETE',
          url: `/api/v1/tasks/${gone}`,
          headers: ctx.authed,
        })
      ).statusCode,
    ).toBe(204)
    expect(open).toBeTruthy()

    expect(rowFor(await movement(), pid).remaining).toBe(1)
  })

  it('omits archived projects, which are set aside and not waiting for anybody', async () => {
    const pid = await createProject(ctx, 'archived')
    await createTask(ctx, pid, 'still open')
    expect(rowFor(await movement(), pid).remaining).toBe(1)

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${pid}`,
      headers: ctx.authed,
      payload: { archived: true },
    })
    expect(res.statusCode).toBe(200)
    expect((await movement()).some((r) => r.projectId === pid)).toBe(false)
  })

  it('counts this week from Monday IN THE USER’S TIMEZONE, not the server’s', async () => {
    const pid = await createProject(ctx, 'week')
    // Sunday 2026-10-04 at 23:30 in Shanghai = 15:30 UTC. Monday 2026-10-05 at 00:30 there is
    // 16:30 UTC on the Sunday. Both are "last week" and "this week" respectively for a Shanghai
    // user; a server computing the week in UTC would put BOTH in the same (wrong) week.
    const lastWeek = await createTask(ctx, pid, 'sunday night')
    const thisWeek = await createTask(ctx, pid, 'monday morning')
    await finishAt(lastWeek, '2026-10-04T15:30:00Z')
    await finishAt(thisWeek, '2026-10-04T16:30:00Z')
    // Wednesday of that Shanghai week.
    const now = new Date('2026-10-07T04:00:00Z')

    const shanghai = await listProjectMovement(ctx.db, workspaceId, 'Asia/Shanghai', now)
    expect(rowFor(shanghai as Row[], pid).doneThisWeek).toBe(1)

    // The same two instants, read by a UTC user: now BOTH fall on Sunday 2026-10-04 UTC, which is
    // the previous week, so the count is zero. Same rows, same clock, different timezone --
    // which is the whole point and is invisible to a test run in one zone only.
    const utc = await listProjectMovement(ctx.db, workspaceId, 'UTC', now)
    expect(rowFor(utc as Row[], pid).doneThisWeek).toBe(0)
  })

  it('reads last activity from the event log, so a pure reorder does not revive a project', async () => {
    const pid = await createProject(ctx, 'quiet')
    const first = await createTask(ctx, pid, 'a')
    const second = await createTask(ctx, pid, 'b')
    // Nine days of silence before a pinned Wednesday.
    const now = new Date('2026-10-07T04:00:00Z')
    await ctx.db.execute(sql`
      update task_events set occurred_at = '2026-09-28T04:00:00Z'
      where task_id in (select id from tasks where project_id = ${pid})
    `)
    const quiet = async () =>
      rowFor((await listProjectMovement(ctx.db, workspaceId, 'UTC', now)) as Row[], pid)

    const before = await quiet()
    expect(before).toMatchObject({ quietDays: 9, lastActivityOn: '2026-09-28' })

    // A reorder: same parent, same project, only the rank changes. It writes no event, so a
    // tidy-up cannot poison this number.
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/tasks/${second}`,
      headers: ctx.authed,
      payload: { projectId: pid, parentId: null, beforeId: first },
    })
    expect(res.statusCode).toBe(200)

    expect(await quiet()).toMatchObject({ quietDays: 9, lastActivityOn: '2026-09-28' })

    // A real change does move it: the number is not simply frozen.
    expect(
      (
        await ctx.app.inject({
          method: 'PATCH',
          url: `/api/v1/tasks/${first}`,
          headers: ctx.authed,
          payload: { title: 'a, renamed' },
        })
      ).statusCode,
    ).toBe(200)
    expect((await quiet()).lastActivityOn).not.toBe('2026-09-28')
  })

  // ------------------------------------------------------------- overdue, the banner's fourth number

  it('counts what is overdue PER PROJECT, not across the workspace', async () => {
    const one = await createProject(ctx, 'one late')
    const three = await createProject(ctx, 'three late')
    await dueAt(await createTask(ctx, one, 'o1'), '2020-01-01T09:00:00Z')
    for (const t of ['t1', 't2', 't3'])
      await dueAt(await createTask(ctx, three, t), '2020-01-01T09:00:00Z')
    // Open and not late, in the same project: the count is not just "how many have a deadline".
    await createTask(ctx, three, 'no deadline')

    const rows = await movement()
    // Two DIFFERENT non-zero numbers, for the same reason the open count asserts two: a subquery that
    // correlated a task to itself reports 0 everywhere, and one that lost its project filter
    // reports the same workspace-wide total on every row. Only 1 and 3 rule out both.
    expect(rowFor(rows, one).overdue).toBe(1)
    expect(rowFor(rows, three).overdue).toBe(3)
  })

  it('leaves finished, cancelled, deleted and not-yet-late tasks out of the overdue count', async () => {
    const pid = await createProject(ctx, 'late leftovers')
    await dueAt(await createTask(ctx, pid, 'really late'), '2020-01-01T09:00:00Z')
    // Finished and cancelled tasks with a deadline in the past: the deadline no longer matters.
    for (const status of ['done', 'cancelled'] as const) {
      const id = await createTask(ctx, pid, `settled ${status}`)
      await dueAt(id, '2020-01-01T09:00:00Z')
      expect(
        (
          await ctx.app.inject({
            method: 'PATCH',
            url: `/api/v1/tasks/${id}`,
            headers: ctx.authed,
            payload: { status },
          })
        ).statusCode,
      ).toBe(200)
    }
    const gone = await createTask(ctx, pid, 'deleted')
    await dueAt(gone, '2020-01-01T09:00:00Z')
    expect(
      (
        await ctx.app.inject({
          method: 'DELETE',
          url: `/api/v1/tasks/${gone}`,
          headers: ctx.authed,
        })
      ).statusCode,
    ).toBe(204)
    // A deadline a long way off is not overdue.
    await dueAt(await createTask(ctx, pid, 'next decade'), '2099-01-01T09:00:00Z')

    expect(rowFor(await movement(), pid).overdue).toBe(1)
  })

  /**
   * The same boundary `listToday` draws, in the SAME zone: a task is overdue when its deadline is
   * before midnight of the user's today. This fixture sits in the hour where the two zones
   * disagree, so a server computing the boundary in UTC gets it wrong for the Shanghai reader --
   * and the project banner would then contradict the Overdue panel on the very same task.
   */
  it('draws the overdue boundary at midnight IN THE USER’S TIMEZONE', async () => {
    const pid = await createProject(ctx, 'late by zone')
    // 2026-10-06 17:00Z is 2026-10-07 01:00 in Shanghai -- during the Shanghai reader's today,
    // so NOT overdue for them -- and still 2026-10-06 for a UTC reader, so overdue for them.
    await dueAt(await createTask(ctx, pid, 'one in the morning'), '2026-10-06T17:00:00Z')
    const now = new Date('2026-10-07T04:00:00Z')

    const shanghai = (await listProjectMovement(ctx.db, workspaceId, 'Asia/Shanghai', now)) as Row[]
    expect(rowFor(shanghai, pid).overdue).toBe(0)

    const utc = (await listProjectMovement(ctx.db, workspaceId, 'UTC', now)) as Row[]
    expect(rowFor(utc, pid).overdue).toBe(1)
  })

  /**
   * THE NEXT DEADLINE STILL STANDING, as the day it falls on in the user's zone: what a project
   * line says when nothing in it is late yet. Earliest of the open ones; never one already past
   * (that is `overdue`'s), never a finished or deleted one.
   */
  it('names the next deadline still standing, as a day in the user’s timezone', async () => {
    const pid = await createProject(ctx, 'next due')
    const quiet = await createProject(ctx, 'nothing due')
    await createTask(ctx, quiet, 'no deadline')
    await dueAt(await createTask(ctx, pid, 'already late'), '2026-10-01T09:00:00Z')
    await dueAt(await createTask(ctx, pid, 'later'), '2026-10-21T09:00:00Z')
    // 2026-10-09 17:00Z is 2026-10-10 01:00 in Shanghai: the day is the reader's, not the server's.
    await dueAt(await createTask(ctx, pid, 'soonest'), '2026-10-09T17:00:00Z')
    const done = await createTask(ctx, pid, 'finished early one')
    await dueAt(done, '2026-10-08T09:00:00Z')
    await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/tasks/${done}`,
      headers: ctx.authed,
      payload: { status: 'done' },
    })
    const now = new Date('2026-10-07T04:00:00Z')
    const rows = (await listProjectMovement(ctx.db, workspaceId, 'Asia/Shanghai', now)) as Row[]
    expect(rowFor(rows, pid).nextDueOn).toBe('2026-10-10')
    expect(rowFor(rows, quiet).nextDueOn).toBeNull()
    // And over the wire, in the contract's shape.
    expect(rowFor(await movement(), quiet).nextDueOn).toBeNull()
  })

  /**
   * The number in the project's head and the rows in Today's Overdue section are two different
   * queries answering one question. This asserts they agree, per project, rather than asserting
   * each against a constant -- which is the only way a drift between them would ever be noticed.
   */
  it('agrees with the overdue segment of today, project by project', async () => {
    const a = await createProject(ctx, 'agree a')
    const b = await createProject(ctx, 'agree b')
    await dueAt(await createTask(ctx, a, 'a late'), '2020-02-02T09:00:00Z')
    await dueAt(await createTask(ctx, b, 'b late 1'), '2020-02-02T09:00:00Z')
    await dueAt(await createTask(ctx, b, 'b late 2'), '2020-03-03T09:00:00Z')

    const today = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/tasks/today',
      headers: ctx.authed,
    })
    expect(today.statusCode).toBe(200)
    const segmented = (today.json().tasks as { projectId: ProjectId; segment: string }[]).filter(
      (t) => t.segment === 'overdue',
    )
    const fromToday = new Map<string, number>()
    for (const t of segmented) fromToday.set(t.projectId, (fromToday.get(t.projectId) ?? 0) + 1)
    // The fixture really does put overdue tasks in more than one project, or "they agree" would
    // be a claim about one number.
    expect(fromToday.get(a)).toBe(1)
    expect(fromToday.get(b)).toBe(2)

    for (const row of await movement())
      expect(row.overdue, row.projectName).toBe(fromToday.get(row.projectId) ?? 0)
  })

  it('reports no activity at all for a project nothing has ever happened in', async () => {
    const pid = await createProject(ctx, 'untouched')
    const row = rowFor(await movement(), pid)
    expect(row.lastActivityOn).toBeNull()
    expect(row.quietDays).toBeNull()
    expect(row).toMatchObject({ remaining: 0, doneThisWeek: 0, overdue: 0 })
  })

  it('shows a workspace only its own projects', async () => {
    const mine = await createProject(ctx, 'mine only')
    await createTask(ctx, mine, 'secret')

    const theirs = await movement(otherAuthed)
    expect(theirs.some((r) => r.projectId === mine)).toBe(false)
    // Their own list is not empty for the wrong reason: they have an inbox of their own.
    expect(theirs.length).toBeGreaterThan(0)
    expect(theirs.every((r) => r.remaining === 0)).toBe(true)

    expect((await movement()).some((r) => r.projectId === mine)).toBe(true)
  })
})
