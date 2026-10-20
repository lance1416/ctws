import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appWithUser, type Harness } from '../helpers/harness'
import { createProject, createTask } from '../helpers/builders'

// Noon in New York on the day DST starts: the local day runs 05:00Z to 04:00Z next day.
const NOW = new Date('2026-03-08T16:00:00Z')
let ctx: Harness

beforeAll(async () => {
  ctx = await appWithUser('clock@example.com', {
    clock: () => NOW,
    timezone: 'America/New_York',
  })
  const projectId = await createProject(ctx, 'Clock')
  const due = {
    lastNight: '2026-03-08T04:30:00Z', // 23:30 EST on the 7th: overdue
    tonight: '2026-03-09T03:30:00Z', // 23:30 EDT on the 8th: today
    tomorrow: '2026-03-09T04:30:00Z', // 00:30 EDT on the 9th: not on Today
  }
  for (const [title, dueAt] of Object.entries(due))
    await createTask(ctx, projectId, title, undefined, { dueAt })
})
afterAll(async () => {
  await ctx?.stop()
})

describe('the injected clock', () => {
  it('decides Today in the account zone', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/tasks?view=today',
      headers: ctx.authed,
    })
    const segments = Object.fromEntries(
      (res.json().tasks as { title: string; segment: string }[]).map((t) => [t.title, t.segment]),
    )
    expect(segments).toEqual({ lastNight: 'overdue', tonight: 'today' })
  })

  const get = async (url: string) =>
    (await ctx.app.inject({ method: 'GET', url, headers: ctx.authed })).json()

  it('decides the review week in the account zone', async () => {
    // Sunday the 8th: the week began on Monday the 2nd.
    expect(await get('/api/v1/tasks?view=review')).toMatchObject({
      from: '2026-03-02',
      to: '2026-03-08',
    })
  })

  it('decides what is overdue and next on the movement read', async () => {
    const { projects } = await get('/api/v1/tasks?view=movement')
    const project = projects.find((p: { projectName: string }) => p.projectName === 'Clock')
    expect(project).toMatchObject({ overdue: 1, nextDueOn: '2026-03-08' })
  })

  it("decides the birthdays page's today", async () => {
    expect((await get('/api/v1/people?view=birthdays')).today).toBe('2026-03-08')
  })
})

describe('what a write stores', () => {
  const send = (method: 'PATCH' | 'POST' | 'DELETE', url: string, payload?: object) =>
    ctx.app.inject({ method, url, headers: ctx.authed, ...(payload ? { payload } : {}) })

  it('takes every instant from the clock, not the database', async () => {
    const projectId = await createProject(ctx, 'Stamped')
    const taskId = await createTask(ctx, projectId, 'stamp me')
    expect((await send('PATCH', `/api/v1/tasks/${taskId}`, { status: 'done' })).statusCode).toBe(
      200,
    )
    expect((await send('DELETE', `/api/v1/tasks/${taskId}`)).statusCode).toBe(204)
    expect(
      (await send('PATCH', `/api/v1/projects/${projectId}`, { archived: true })).json(),
    ).toMatchObject({ archivedAt: NOW.toISOString(), createdAt: NOW.toISOString() })

    const stone = await ctx.db.execute(sql`
      select deleted_at from tombstones where object_type = 'task' and object_id = ${taskId}
    `)
    expect(new Date(String((stone.rows[0] as { deleted_at: unknown }).deleted_at))).toEqual(NOW)
    const project = await ctx.db.execute(sql`
      select created_at, archived_at from projects where id = ${projectId}
    `)
    for (const value of Object.values(project.rows[0]!)) {
      expect(new Date(String(value))).toEqual(NOW)
    }
    const events = await ctx.db.execute(sql`
      select occurred_at from events where object_type = 'project' and object_id = ${projectId}
    `)
    expect(events.rows.length).toBeGreaterThan(0)
    for (const row of events.rows) expect(new Date(String(row.occurred_at))).toEqual(NOW)
  })
})
