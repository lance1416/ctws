import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { createProject, createTask, setupWith, type TaskCtx } from './helpers/tasks'

const cleanups: (() => Promise<void>)[] = []

const setup = () => setupWith(cleanups)
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!()
})

type Page = {
  events: { id: string; type: string; occurredAt: string }[]
  nextCursor: string | null
}

function events(ctx: TaskCtx, taskId: string, query = '', headers = ctx.authed) {
  return ctx.app.inject({
    method: 'GET',
    url: `/api/v1/tasks/${taskId}/events${query}`,
    headers,
  })
}

async function page(ctx: TaskCtx, taskId: string, query = ''): Promise<Page> {
  const res = await events(ctx, taskId, query)
  expect(res.statusCode).toBe(200)
  return res.json() as Page
}

/** Walks every page at `limit` and returns the ids in the order served, plus the page count. */
async function walk(ctx: TaskCtx, taskId: string, limit: number) {
  const ids: string[] = []
  let cursor: string | null = null
  let pages = 0
  do {
    const body: Page = await page(
      ctx,
      taskId,
      `?limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`,
    )
    ids.push(...body.events.map((e) => e.id))
    cursor = body.nextCursor
    pages++
  } while (cursor)
  return { ids, pages }
}

/** Inserts `n` events straight into the log, all at one instant, so only id can order them. */
async function insertAt(ctx: TaskCtx, taskId: string, n: number, at: string): Promise<string[]> {
  const meta = (
    await ctx.db.execute(sql`
      select p.workspace_id, (select id from users limit 1) as actor
      from tasks t join projects p on p.id = t.project_id where t.id = ${taskId}
    `)
  ).rows[0] as { workspace_id: string; actor: string }
  const ids: string[] = []
  for (let i = 0; i < n; i++) {
    const id = randomUUID()
    ids.push(id)
    await ctx.db.execute(sql`
      insert into task_events (id, task_id, workspace_id, actor_user_id, type, payload, occurred_at)
      values (${id}, ${taskId}, ${meta.workspace_id}, ${meta.actor}, 'status_changed',
              '{}'::jsonb, ${at}::timestamptz)
    `)
  }
  return ids
}

/** A task with exactly `n` events: `created` plus n-1 status changes (never coalesced). */
async function taskWithEvents(ctx: TaskCtx, n: number): Promise<string> {
  const p = await createProject(ctx, 'P')
  const t = await createTask(ctx, p, 't0')
  // Starts at in_progress, not todo: a task is CREATED on todo now, and a PATCH to the status
  // it already has is a no-op that writes no event -- which would quietly make this n-1.
  const statuses = ['in_progress', 'todo', 'in_progress', 'todo', 'in_progress', 'todo']
  for (let i = 0; i < n - 1; i++) {
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/tasks/${t}`,
      headers: ctx.authed,
      payload: { status: statuses[i] },
    })
    expect(res.statusCode).toBe(200)
  }
  return t
}

describe('GET /tasks/:id/events', () => {
  it('returns a task history newest first', async () => {
    const ctx = await setup()
    const t = await taskWithEvents(ctx, 3)
    const body = await page(ctx, t)
    expect(body.events).toHaveLength(3)
    expect(body.events.map((e) => e.type)).toEqual(['status_changed', 'status_changed', 'created'])
    const times = body.events.map((e) => e.occurredAt)
    expect([...times].sort().reverse()).toEqual(times)
    expect(body.nextCursor).toBeNull()
  })

  it('paginates with a cursor and does not repeat or skip rows', async () => {
    const ctx = await setup()
    const t = await taskWithEvents(ctx, 5)
    const all = (await page(ctx, t)).events.map((e) => e.id)
    expect(all).toHaveLength(5)
    const { ids, pages } = await walk(ctx, t, 2)
    expect(pages).toBe(3)
    expect(ids).toEqual(all)
    expect(new Set(ids).size).toBe(5)
  })

  it('pages across events that share a timestamp without skipping or repeating', async () => {
    const ctx = await setup()
    const p = await createProject(ctx, 'P')
    const t = await createTask(ctx, p, 't0')
    // 5 tied events plus the real `created` one. The tie group is larger than the page size, so
    // a page boundary falls inside it: only the id tiebreak can serve it correctly.
    const tied = await insertAt(ctx, t, 5, '2999-01-01T00:00:00Z')
    const full = (await page(ctx, t)).events.map((e) => e.id)
    expect(full).toHaveLength(6)
    const { ids } = await walk(ctx, t, 2)
    expect(new Set(ids).size).toBe(ids.length)
    expect([...ids].sort()).toEqual([...full].sort())
    expect(ids).toEqual(full)
    expect(ids.filter((id) => tied.includes(id))).toEqual([...tied].sort().reverse())
  })

  it('keeps sub-millisecond ordering across pages', async () => {
    const ctx = await setup()
    const p = await createProject(ctx, 'P')
    const t = await createTask(ctx, p, 't0')
    await insertAt(ctx, t, 1, '2999-01-01T00:00:00.000100Z')
    await insertAt(ctx, t, 1, '2999-01-01T00:00:00.000200Z')
    await insertAt(ctx, t, 1, '2999-01-01T00:00:00.000300Z')
    const { ids } = await walk(ctx, t, 1)
    expect(ids).toHaveLength(4)
    expect(new Set(ids).size).toBe(4)
  })

  it('returns null nextCursor on the last page', async () => {
    const ctx = await setup()
    const t = await taskWithEvents(ctx, 3)
    const first = await page(ctx, t, '?limit=2')
    expect(first.nextCursor).not.toBeNull()
    const second = await page(ctx, t, `?limit=2&cursor=${first.nextCursor}`)
    expect(second.events).toHaveLength(1)
    expect(second.nextCursor).toBeNull()
  })

  it('returns null nextCursor when the count is an exact multiple of limit', async () => {
    const ctx = await setup()
    const t = await taskWithEvents(ctx, 4)
    const first = await page(ctx, t, '?limit=2')
    expect(first.events).toHaveLength(2)
    expect(first.nextCursor).not.toBeNull()
    const second = await page(ctx, t, `?limit=2&cursor=${first.nextCursor}`)
    expect(second.events).toHaveLength(2)
    expect(second.nextCursor).toBeNull()
  })

  it('uses an opaque cursor', async () => {
    const ctx = await setup()
    const t = await taskWithEvents(ctx, 3)
    const { nextCursor } = await page(ctx, t, '?limit=1')
    expect(nextCursor).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(nextCursor).not.toMatch(/\d{4}-\d{2}-\d{2}/)
  })

  it.each([
    ['not base64 at all', '!!!not-a-cursor!!!'],
    ['valid base64url of garbage', Buffer.from('hello').toString('base64url')],
    ['wrong shape', Buffer.from('2026-01-01|nope').toString('base64url')],
    ['truncated', 'MjAyNi0wMS0wMVQwMDow'],
    ['injection attempt', Buffer.from("x'; drop table tasks;--|y").toString('base64url')],
  ])('answers 400, not 500, to a bad cursor (%s)', async (_name, cursor) => {
    const ctx = await setup()
    const t = await taskWithEvents(ctx, 2)
    const res = await events(ctx, t, `?cursor=${encodeURIComponent(cursor)}`)
    expect(res.statusCode).toBe(400)
    expect(res.headers['content-type']).toContain('application/problem+json')
  })

  it('rejects a tampered cursor', async () => {
    const ctx = await setup()
    const t = await taskWithEvents(ctx, 3)
    const { nextCursor } = await page(ctx, t, '?limit=1')
    const raw = Buffer.from(nextCursor!, 'base64url').toString('utf8')
    const tampered = Buffer.from(raw.slice(0, -3)).toString('base64url')
    expect((await events(ctx, t, `?cursor=${tampered}`)).statusCode).toBe(400)
  })

  it.each(['0', '-1', '101', 'abc', '1.5'])('rejects limit=%s with 400', async (limit) => {
    const ctx = await setup()
    const t = await taskWithEvents(ctx, 1)
    expect((await events(ctx, t, `?limit=${limit}`)).statusCode).toBe(400)
  })

  it('accepts the limit bounds 1 and 100', async () => {
    const ctx = await setup()
    const t = await taskWithEvents(ctx, 2)
    expect((await page(ctx, t, '?limit=1')).events).toHaveLength(1)
    expect((await page(ctx, t, '?limit=100')).events).toHaveLength(2)
  })

  it('404s for another workspace task', async () => {
    const ctx = await setup()
    const p = await createProject(ctx, 'P')
    const t = await createTask(ctx, p, 't')
    const reg = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'x-ctws-client': 'web' },
      payload: { email: 'other@example.com', password: 'correct horse battery', timezone: 'UTC' },
    })
    const other = {
      'x-ctws-client': 'web',
      cookie: String(reg.headers['set-cookie']).split(';')[0]!,
    }
    expect((await events(ctx, t, '', other)).statusCode).toBe(404)
    expect((await events(ctx, t)).statusCode).toBe(200)
  })

  it('404s for a task that does not exist', async () => {
    const ctx = await setup()
    expect((await events(ctx, randomUUID())).statusCode).toBe(404)
  })

  it('404s for a soft-deleted task', async () => {
    const ctx = await setup()
    const p = await createProject(ctx, 'P')
    const t = await createTask(ctx, p, 't')
    expect((await events(ctx, t)).statusCode).toBe(200)
    await ctx.app.inject({ method: 'DELETE', url: `/api/v1/tasks/${t}`, headers: ctx.authed })
    expect((await events(ctx, t)).statusCode).toBe(404)
  })

  it('requires authentication', async () => {
    const ctx = await setup()
    const p = await createProject(ctx, 'P')
    const t = await createTask(ctx, p, 't')
    const res = await events(ctx, t, '', { 'x-ctws-client': 'web' })
    expect(res.statusCode).toBe(401)
  })
})
