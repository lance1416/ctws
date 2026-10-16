import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Queryable } from '../../../src/platform/db/client'
import { taskLog } from '../../../src/modules/tasks/log'
import { withDatabase } from '../../helpers/db'

let ctx: Awaited<ReturnType<typeof withDatabase>>
let workspaceId: string
let taskId: string

beforeAll(async () => {
  ctx = await withDatabase()
  // Seeded directly: this file tests the event log, not the task commands.
  const seed = await ctx.db.execute(sql`
    with w as (insert into workspaces (id, name) values (gen_random_uuid(), 'w') returning id),
         p as (insert into projects (id, workspace_id, name, rank, color)
               values (gen_random_uuid(), (select id from w), 'p', 'a0', 'project-1') returning id),
         t1 as (insert into tasks (id, project_id, title, status, rank)
                values (gen_random_uuid(), (select id from p), 't1', 'todo', 'a0') returning id)
    select (select id from w) as w, (select id from t1) as t1
  `)
  const r = (seed.rows as Record<string, string>[])[0]!
  workspaceId = r.w!
  taskId = r.t1!
}, 120_000)

afterAll(async () => {
  await ctx?.stop()
})

const logOf = (q: Queryable = ctx.db) => taskLog(q, { workspaceId })

async function events() {
  const r = await ctx.db.execute(sql`
    select type, payload, workspace_id from task_events
    where task_id = ${taskId} order by occurred_at
  `)
  return r.rows as { type: string; payload: unknown; workspace_id: string }[]
}

async function clear() {
  await ctx.db.execute(sql`delete from task_events`)
}

describe('taskLog', () => {
  it('records an event with its payload and workspace', async () => {
    await clear()
    await logOf().append(taskId, 'status_changed', { from: 'todo', to: 'in_progress' })
    const rows = await events()
    expect(rows).toEqual([
      {
        type: 'status_changed',
        payload: { from: 'todo', to: 'in_progress' },
        workspace_id: workspaceId,
      },
    ])
  })

  it('appends every event as its own row', async () => {
    await clear()
    await logOf().append(taskId, 'title_changed', { from: 'a', to: 'ab' })
    await logOf().append(taskId, 'title_changed', { from: 'ab', to: 'abc' })
    expect((await events()).map((e) => e.payload)).toEqual([
      { from: 'a', to: 'ab' },
      { from: 'ab', to: 'abc' },
    ])
  })

  it('writes inside the caller transaction, so a rollback discards the event', async () => {
    await clear()
    await expect(
      ctx.db.transaction(async (tx) => {
        await logOf(tx).append(taskId, 'status_changed', { from: 'todo', to: 'done' })
        throw new Error('rollback')
      }),
    ).rejects.toThrow('rollback')
    expect(await events()).toHaveLength(0)
  })
})
