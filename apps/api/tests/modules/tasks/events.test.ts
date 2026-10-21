import type { TaskId, WorkspaceId } from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Tx } from '../../../src/platform/db/client'
import { taskLog } from '../../../src/modules/tasks/log'
import { withDatabase } from '../../helpers/db'

let ctx: Awaited<ReturnType<typeof withDatabase>>
let workspaceId: WorkspaceId
let taskId: TaskId

beforeAll(async () => {
  ctx = await withDatabase()
  // Seeded directly: this file tests the event log, not the task commands.
  const seed = await ctx.db.execute(sql`
    with w as (insert into workspaces (id) values (gen_random_uuid()) returning id),
         p as (insert into projects (id, workspace_id, name, rank, color)
               values (gen_random_uuid(), (select id from w), 'p', 'a0', 'blue') returning id),
         t1 as (insert into tasks (id, workspace_id, project_id, title, status, rank)
                values (gen_random_uuid(), (select id from w), (select id from p), 't1', 'todo', 'a0')
                returning id)
    select (select id from w) as w, (select id from t1) as t1
  `)
  const r = (seed.rows as { w: WorkspaceId; t1: TaskId }[])[0]!
  workspaceId = r.w
  taskId = r.t1
}, 120_000)

afterAll(async () => {
  await ctx?.stop()
})

const logOf = (tx: Tx) => taskLog(tx, { workspaceId, now: new Date() })

/** One append in a transaction of its own. */
const append = (...args: Parameters<ReturnType<typeof logOf>['append']>) =>
  ctx.db.transaction((tx) => logOf(tx).append(...args))

async function events() {
  const r = await ctx.db.execute(sql`
    select type, payload, workspace_id from events
    where object_type = 'task' and object_id = ${taskId} order by occurred_at, id
  `)
  return r.rows as { type: string; payload: unknown; workspace_id: WorkspaceId }[]
}

async function clear() {
  await ctx.db.execute(sql`delete from events`)
}

describe('taskLog', () => {
  it('records an event with its payload and workspace', async () => {
    await clear()
    await append(taskId, 'status_changed', { from: 'todo', to: 'in_progress' })
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
    await append(taskId, 'title_changed', { from: 'a', to: 'ab' })
    await append(taskId, 'title_changed', { from: 'ab', to: 'abc' })
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
