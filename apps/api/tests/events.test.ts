import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Queryable } from '../src/platform/db/client'
import { taskLog } from '../src/modules/tasks/log'
import { withDatabase } from './helpers/db'

let ctx: Awaited<ReturnType<typeof withDatabase>>
let workspaceId: string
let actorA: string
let actorB: string
let taskId: string
let otherTaskId: string

beforeAll(async () => {
  ctx = await withDatabase()
  // Seeded directly: this file tests the event log, not the task commands.
  const seed = await ctx.db.execute(sql`
    with w as (insert into workspaces (id, name) values (gen_random_uuid(), 'w') returning id),
         ua as (insert into users (id, email, password_hash, timezone, role)
                values (gen_random_uuid(), 'a@x.com', 'x', 'UTC', 'member') returning id),
         ub as (insert into users (id, email, password_hash, timezone, role)
                values (gen_random_uuid(), 'b@x.com', 'x', 'UTC', 'member') returning id),
         p as (insert into projects (id, workspace_id, name, rank)
               values (gen_random_uuid(), (select id from w), 'p', 'a0') returning id),
         t1 as (insert into tasks (id, project_id, title, status, rank)
                values (gen_random_uuid(), (select id from p), 't1', 'todo', 'a0') returning id),
         t2 as (insert into tasks (id, project_id, title, status, rank)
                values (gen_random_uuid(), (select id from p), 't2', 'todo', 'a1') returning id)
    select (select id from w) as w, (select id from ua) as ua,
           (select id from ub) as ub, (select id from t1) as t1, (select id from t2) as t2
  `)
  const r = (seed.rows as Record<string, string>[])[0]!
  workspaceId = r.w!
  actorA = r.ua!
  actorB = r.ub!
  taskId = r.t1!
  otherTaskId = r.t2!
}, 120_000)

afterAll(async () => {
  await ctx?.stop()
})

const logOf = (actorUserId: string, q: Queryable = ctx.db) =>
  taskLog(q, { workspaceId, actorUserId })

async function events(tid = taskId) {
  const r = await ctx.db.execute(sql`
    select type, payload, actor_user_id, occurred_at from task_events
    where task_id = ${tid} order by occurred_at
  `)
  return r.rows as { type: string; payload: unknown; actor_user_id: string }[]
}

async function clear() {
  await ctx.db.execute(sql`delete from task_events`)
}

describe('taskLog', () => {
  it('records an event with its payload and actor', async () => {
    await clear()
    await logOf(actorA).append(taskId, 'status_changed', { from: 'todo', to: 'in_progress' })
    const rows = await events()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.type).toBe('status_changed')
    expect(rows[0]!.payload).toEqual({ from: 'todo', to: 'in_progress' })
    expect(rows[0]!.actor_user_id).toBe(actorA)
  })

  it('appends rather than coalescing for status changes', async () => {
    await clear()
    for (const to of ['in_progress', 'done']) {
      await logOf(actorA).append(taskId, 'status_changed', { from: 'todo', to })
    }
    expect(await events()).toHaveLength(2)
  })

  // Otherwise every autosave becomes a row.
  it('coalesces consecutive title edits by the same actor into one event', async () => {
    await clear()
    await logOf(actorA).append(taskId, 'title_changed', { from: 'a', to: 'ab' })
    await logOf(actorA).append(taskId, 'title_changed', { from: 'ab', to: 'abc' })
    const rows = await events()
    expect(rows).toHaveLength(1)
    // The merged event spans the whole edit: the original `from`, the latest `to`.
    expect(rows[0]!.payload).toEqual({ from: 'a', to: 'abc' })
  })

  it('does not coalesce across actors', async () => {
    await clear()
    await logOf(actorA).append(taskId, 'title_changed', { from: 'a', to: 'ab' })
    await logOf(actorB).append(taskId, 'title_changed', { from: 'ab', to: 'abc' })
    expect(await events()).toHaveLength(2)
  })

  it('does not coalesce across event types', async () => {
    await clear()
    await logOf(actorA).append(taskId, 'title_changed', { from: 'a', to: 'ab' })
    await logOf(actorA).append(taskId, 'notes_changed', { from: null, to: 'n' })
    expect(await events()).toHaveLength(2)
  })

  it('does not coalesce across tasks', async () => {
    await clear()
    await logOf(actorA).append(taskId, 'title_changed', { from: 'a', to: 'ab' })
    await logOf(actorA).append(otherTaskId, 'title_changed', { from: 'x', to: 'xy' })
    expect(await events()).toHaveLength(1)
    expect(await events(otherTaskId)).toHaveLength(1)
  })

  it('starts a new event once the window has passed', async () => {
    await clear()
    await logOf(actorA).append(taskId, 'title_changed', { from: 'a', to: 'ab' })
    // Back-date the existing event out of the coalescing window.
    await ctx.db.execute(sql`
      update task_events set occurred_at = now() - interval '6 minutes' where task_id = ${taskId}
    `)
    await logOf(actorA).append(taskId, 'title_changed', { from: 'ab', to: 'abc' })
    expect(await events()).toHaveLength(2)
  })

  it('writes inside the caller transaction, so a rollback discards the event', async () => {
    await clear()
    await expect(
      ctx.db.transaction(async (tx) => {
        await logOf(actorA, tx).append(taskId, 'status_changed', { from: 'todo', to: 'done' })
        throw new Error('rollback')
      }),
    ).rejects.toThrow('rollback')
    expect(await events()).toHaveLength(0)
  })
})
