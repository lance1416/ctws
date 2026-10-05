import { sql } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { listToday } from '../src/tasks/today'
import { appWithUser, createProject, createTask, type TaskCtx } from './helpers/tasks'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

async function setup(timezone?: string) {
  const ctx = await appWithUser()
  cleanups.push(ctx.stop)
  if (timezone) {
    await ctx.db.execute(sql`update users set timezone = ${timezone}`)
  }
  return ctx
}

async function today(ctx: Awaited<ReturnType<typeof setup>>) {
  const res = await ctx.app.inject({
    method: 'GET',
    url: '/api/v1/tasks/today',
    headers: ctx.authed,
  })
  expect(res.statusCode).toBe(200)
  return res.json().tasks as {
    id: string
    segment: string
    projectName: string
    parentTitle: string | null
  }[]
}

/** Writes the scheduling columns directly: the API takes them, but these tests need exact values. */
async function schedule(
  ctx: Awaited<ReturnType<typeof setup>>,
  id: string,
  cols: { scheduledOn?: string | null; dueAt?: string | null; status?: string },
) {
  if (cols.scheduledOn !== undefined)
    await ctx.db.execute(sql`update tasks set scheduled_on = ${cols.scheduledOn} where id = ${id}`)
  if (cols.dueAt !== undefined)
    await ctx.db.execute(sql`update tasks set due_at = ${cols.dueAt} where id = ${id}`)
  if (cols.status !== undefined)
    await ctx.db.execute(sql`update tasks set status = ${cols.status} where id = ${id}`)
}

describe('GET /today', () => {
  it('requires authentication', async () => {
    const ctx = await setup()
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/tasks/today',
      headers: { 'x-ctws-client': 'web' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('is empty when nothing is scheduled, due or in progress', async () => {
    const ctx = await setup()
    const p = await createProject(ctx, 'p')
    await createTask(ctx, p, 'untouched')
    expect(await today(ctx)).toEqual([])
  })

  // Review Focus 2. A task that is both overdue and in_progress must appear ONCE.
  // The query labels every row that is not overdue or today as in_progress, relying on its WHERE
  // to let only in-progress rows reach that arm. A `todo` task is the status most likely to be
  // added to that WHERE later, so pin that it is neither listed nor mislabelled today.
  it('does not list a dateless todo task, and never labels a todo task in_progress', async () => {
    const ctx = await setup()
    const p = await createProject(ctx, 'p')
    const dateless = await createTask(ctx, p, 'todo, no dates')
    const scheduled = await createTask(ctx, p, 'todo, scheduled')
    await schedule(ctx, dateless, { status: 'todo' })
    await schedule(ctx, scheduled, { status: 'todo', scheduledOn: '2020-01-01' })

    const rows = await today(ctx)
    expect(rows.find((r) => r.id === dateless)?.segment ?? 'absent').toBe('absent')
    expect(rows.find((r) => r.id === scheduled)?.segment).toBe('today')
    expect(rows.filter((r) => r.segment === 'in_progress')).toEqual([])
  })

  it('puts a task that matches several segments in exactly one', async () => {
    const ctx = await setup()
    const p = await createProject(ctx, 'p')
    const id = await createTask(ctx, p, 'both')
    await schedule(ctx, id, { dueAt: '2020-01-01T00:00:00Z', status: 'in_progress' })

    const rows = await today(ctx)
    expect(rows.filter((r) => r.id === id)).toHaveLength(1)
    expect(rows.find((r) => r.id === id)!.segment).toBe('overdue')
  })

  it('carries the project name and the parent title for the breadcrumb', async () => {
    const ctx = await setup()
    const p = await createProject(ctx, 'CTWS')
    const parent = await createTask(ctx, p, 'M2b')
    const child = await createTask(ctx, p, 'tree component', parent)
    await schedule(ctx, child, { status: 'in_progress' })
    await schedule(ctx, parent, { status: 'in_progress' })

    const rows = await today(ctx)
    expect(rows.find((r) => r.id === child)).toMatchObject({
      projectName: 'CTWS',
      parentTitle: 'M2b',
    })
    expect(rows.find((r) => r.id === parent)!.parentTitle).toBeNull()
  })

  it('excludes done, cancelled and soft-deleted tasks', async () => {
    const ctx = await setup()
    const p = await createProject(ctx, 'p')
    const done = await createTask(ctx, p, 'done')
    const cancelled = await createTask(ctx, p, 'cancelled')
    const gone = await createTask(ctx, p, 'gone')
    await schedule(ctx, done, { status: 'done', dueAt: '2020-01-01T00:00:00Z' })
    await schedule(ctx, cancelled, { status: 'cancelled', dueAt: '2020-01-01T00:00:00Z' })
    await schedule(ctx, gone, { status: 'in_progress' })
    await ctx.app.inject({ method: 'DELETE', url: `/api/v1/tasks/${gone}`, headers: ctx.authed })

    expect(await today(ctx)).toEqual([])
  })

  it('keeps a past scheduled_on in the today segment rather than dropping it', async () => {
    const ctx = await setup('UTC')
    const p = await createProject(ctx, 'p')
    const id = await createTask(ctx, p, 'yesterday')
    await schedule(ctx, id, { scheduledOn: '2020-01-01' })

    const rows = await today(ctx)
    expect(rows.find((r) => r.id === id)!.segment).toBe('today')
  })

  it('does not show a future scheduled_on', async () => {
    const ctx = await setup('UTC')
    const p = await createProject(ctx, 'p')
    const id = await createTask(ctx, p, 'later')
    await schedule(ctx, id, { scheduledOn: '2999-01-01' })
    expect(await today(ctx)).toEqual([])
  })

  it('cannot see another workspace', async () => {
    // Both users must live in ONE database: every appWithUser() boots its own Postgres, so two
    // of them would be isolated trivially and this test could never fail.
    const a = await setup()
    const reg = await a.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'x-ctws-client': 'web' },
      payload: { email: 'other@example.com', password: 'correct horse battery', timezone: 'UTC' },
    })
    expect(reg.statusCode).toBe(201)
    const cookie = String(reg.headers['set-cookie']).split(';')[0]!
    const b = { ...a, cookie, authed: { 'x-ctws-client': 'web', cookie } }

    const p = await createProject(b, 'theirs')
    const id = await createTask(b, p, 'theirs')
    await schedule(b, id, { status: 'in_progress' })

    // The row is real and visible to its owner, so its absence for `a` is the scoping at work.
    expect((await today(b)).some((r) => r.id === id)).toBe(true)
    expect((await today(a)).some((r) => r.id === id)).toBe(false)
  })

  // Precedence between the first two arms: swapping them in the CASE must not pass the suite.
  it('puts a task that is both overdue and scheduled in the past in overdue, once', async () => {
    const ctx = await setup('UTC')
    const p = await createProject(ctx, 'p')
    const id = await createTask(ctx, p, 'both')
    await schedule(ctx, id, { scheduledOn: '2020-01-01', dueAt: '2020-01-01T00:00:00Z' })

    const rows = (await today(ctx)).filter((r) => r.id === id)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.segment).toBe('overdue')
  })

  it('excludes tasks of an archived project', async () => {
    const ctx = await setup()
    const p = await createProject(ctx, 'shelved')
    const id = await createTask(ctx, p, 'was in progress')
    await schedule(ctx, id, { status: 'in_progress' })
    expect((await today(ctx)).some((r) => r.id === id)).toBe(true)

    await ctx.db.execute(sql`update projects set archived_at = now() where id = ${p}`)
    expect(await today(ctx)).toEqual([])
  })

  it('orders overdue by due_at ascending', async () => {
    const ctx = await setup()
    const p = await createProject(ctx, 'p')
    const older = await createTask(ctx, p, 'older')
    const newer = await createTask(ctx, p, 'newer')
    await schedule(ctx, older, { dueAt: '2020-01-01T00:00:00Z' })
    await schedule(ctx, newer, { dueAt: '2021-01-01T00:00:00Z' })
    const rows = (await today(ctx)).filter((r) => r.segment === 'overdue').map((r) => r.id)
    expect(rows).toEqual([older, newer])
  })

  it('orders the segments overdue, today, in_progress', async () => {
    const ctx = await setup('UTC')
    const p = await createProject(ctx, 'p')
    const o = await createTask(ctx, p, 'o')
    const t = await createTask(ctx, p, 't')
    const i = await createTask(ctx, p, 'i')
    await schedule(ctx, o, { dueAt: '2020-01-01T00:00:00Z' })
    await schedule(ctx, t, { scheduledOn: '2020-01-02' })
    await schedule(ctx, i, { status: 'in_progress' })
    expect((await today(ctx)).map((r) => r.segment)).toEqual(['overdue', 'today', 'in_progress'])
  })
})

// Review Focus 3. A UTC-or-server-local implementation passes every test above and fails here.
// These call listToday with a fixed clock, so every case runs on every run, whatever time the
// suite starts, and each asserts the EXACT segment rather than "not today".
describe('listToday timezone and DST', () => {
  type Case = {
    name: string
    tz: string
    now: string
    cols: { scheduledOn?: string; dueAt?: string }
    expected: string
  }

  // now = 2026-10-02T04:00Z is 12:00 on Oct 2 in Shanghai (day = Oct 1 16:00Z..Oct 2 16:00Z) and
  // 21:00 on Oct 1 in Los Angeles (day = Oct 1 07:00Z..Oct 2 07:00Z): different calendar dates.
  const NOW = '2026-10-02T04:00:00Z'
  const cases: Case[] = [
    {
      name: 'due 10:00Z Oct 1: Shanghai is already past it',
      tz: 'Asia/Shanghai',
      now: NOW,
      cols: { dueAt: '2026-10-01T10:00:00Z' },
      expected: 'overdue',
    },
    {
      name: 'due 10:00Z Oct 1: still inside the Los Angeles day',
      tz: 'America/Los_Angeles',
      now: NOW,
      cols: { dueAt: '2026-10-01T10:00:00Z' },
      expected: 'today',
    },
    {
      name: 'due 10:00Z Oct 2: inside the Shanghai day',
      tz: 'Asia/Shanghai',
      now: NOW,
      cols: { dueAt: '2026-10-02T10:00:00Z' },
      expected: 'today',
    },
    {
      name: 'due 10:00Z Oct 2: after the Los Angeles day ends',
      tz: 'America/Los_Angeles',
      now: NOW,
      cols: { dueAt: '2026-10-02T10:00:00Z' },
      expected: 'absent',
    },
    // scheduled_on is a calendar day compared with the LOCAL date, with <=.
    {
      name: 'scheduled Oct 2: local date in Shanghai',
      tz: 'Asia/Shanghai',
      now: NOW,
      cols: { scheduledOn: '2026-10-02' },
      expected: 'today',
    },
    {
      name: 'scheduled Oct 2: tomorrow in Los Angeles',
      tz: 'America/Los_Angeles',
      now: NOW,
      cols: { scheduledOn: '2026-10-02' },
      expected: 'absent',
    },
    {
      name: 'scheduled Oct 1: yesterday in Shanghai',
      tz: 'Asia/Shanghai',
      now: NOW,
      cols: { scheduledOn: '2026-10-01' },
      expected: 'today',
    },
    {
      name: 'scheduled Oct 1: exactly the local date in Los Angeles (<=, not <)',
      tz: 'America/Los_Angeles',
      now: NOW,
      cols: { scheduledOn: '2026-10-01' },
      expected: 'today',
    },
    // Fall back, 2026-11-01 in Los Angeles: the local day is 25h (07:00Z..08:00Z next day) and
    // 01:00-02:00 happens twice. A day is not 24h here.
    {
      name: 'DST fall-back: first 01:30 (PDT)',
      tz: 'America/Los_Angeles',
      now: '2026-11-01T12:00:00Z',
      cols: { dueAt: '2026-11-01T08:30:00Z' },
      expected: 'today',
    },
    {
      name: 'DST fall-back: second 01:30 (PST)',
      tz: 'America/Los_Angeles',
      now: '2026-11-01T12:00:00Z',
      cols: { dueAt: '2026-11-01T09:30:00Z' },
      expected: 'today',
    },
    {
      name: 'DST fall-back: 23:30 PST, the extra hour at the end of the day',
      tz: 'America/Los_Angeles',
      now: '2026-11-01T12:00:00Z',
      cols: { dueAt: '2026-11-02T07:30:00Z' },
      expected: 'today',
    },
    {
      name: 'DST fall-back: 00:30 next day is not today',
      tz: 'America/Los_Angeles',
      now: '2026-11-01T12:00:00Z',
      cols: { dueAt: '2026-11-02T08:30:00Z' },
      expected: 'absent',
    },
    // Spring forward, 2026-03-08: the local day is 23h (08:00Z..07:00Z next day).
    {
      name: 'DST spring-forward: 23:30 PDT',
      tz: 'America/Los_Angeles',
      now: '2026-03-08T20:00:00Z',
      cols: { dueAt: '2026-03-09T06:30:00Z' },
      expected: 'today',
    },
    {
      name: 'DST spring-forward: 00:30 next day is not today',
      tz: 'America/Los_Angeles',
      now: '2026-03-08T20:00:00Z',
      cols: { dueAt: '2026-03-09T07:30:00Z' },
      expected: 'absent',
    },
  ]

  // ONE container for the whole table: listToday takes the timezone and the clock as arguments,
  // so no row needs its own database. That makes the database shared, so every row creates a task
  // with its own title, looks it up by ITS OWN id, and asserts only on that row. "absent" means
  // this id is absent, never that the result is empty.
  let shared: TaskCtx
  let projectId: string
  let workspaceId: string
  beforeAll(async () => {
    shared = await appWithUser()
    projectId = await createProject(shared, 'p')
    workspaceId = (
      await shared.db.execute(sql`select workspace_id from projects where id = ${projectId}`)
    ).rows[0]!.workspace_id as string
  }, 120_000)
  afterAll(async () => {
    await shared?.stop()
  })

  // The DST rows only discriminate under a UTC session zone: the broken form (timestamptz +
  // interval '1 day') does its calendar arithmetic in the session zone, so in a session set to
  // America/Los_Angeles it would be correct by accident and both DST rows would pass while
  // guarding nothing. Fail loudly if the container's zone ever changes.
  it('runs under a UTC database session zone, which the DST rows depend on', async () => {
    const r = await shared.db.execute(sql`show timezone`)
    expect((r.rows[0] as { TimeZone: string }).TimeZone).toBe('UTC')
  })

  it.each(cases)('$name', async ({ name, tz, now, cols, expected }) => {
    const id = await createTask(shared, projectId, name)
    await schedule(shared, id, cols)

    const rows = await listToday(shared.db, workspaceId, tz, new Date(now))
    expect(rows.find((r) => r.id === id)?.segment ?? 'absent').toBe(expected)
  })
})
