import { TASK_STATUSES } from '@ctws/contracts'
import { rankBetween } from '@ctws/core'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { withDatabase } from '../../helpers/db'
import { sqlStateOf } from '../../helpers/sql'

let ctx: Awaited<ReturnType<typeof withDatabase>>

beforeAll(async () => {
  ctx = await withDatabase()
}, 120_000)

afterAll(async () => {
  await ctx?.stop()
})

async function columns(table: string) {
  const r = await ctx.db.execute(sql`
    select column_name, data_type, is_nullable
    from information_schema.columns where table_name = ${table}
  `)
  return r.rows as { column_name: string; data_type: string; is_nullable: string }[]
}

async function count(table: 'projects' | 'tasks' | 'events', col: string, id: string) {
  const r = await ctx.db.execute(
    sql`select count(*)::int as n from ${sql.identifier(table)} where ${sql.identifier(col)} = ${id}`,
  )
  return (r.rows as { n: number }[])[0]!.n
}

const FOREIGN_KEY_VIOLATION = '23503'
const CHECK_VIOLATION = '23514'

// One workspace with a project, a task and an event on that task.
async function seed() {
  const id = async (q: ReturnType<typeof sql>) => (await ctx.db.execute(q)).rows[0]!.id as string
  const workspaceId = await id(sql`
    insert into workspaces (id) values (gen_random_uuid()) returning id
  `)
  const projectId = await id(sql`
    insert into projects (id, workspace_id, name, rank, color)
    values (gen_random_uuid(), ${workspaceId}, 'p', 'a0', 'blue') returning id
  `)
  const taskId = await id(sql`
    insert into tasks (id, workspace_id, project_id, title, status, rank)
    values (gen_random_uuid(), ${workspaceId}, ${projectId}, 't', 'todo', 'a0') returning id
  `)
  await ctx.db.execute(sql`
    insert into events (id, workspace_id, object_type, object_id, type, payload, occurred_at)
    values (gen_random_uuid(), ${workspaceId}, 'task', ${taskId}, 'created', '{}'::jsonb, now())
  `)
  return { workspaceId, projectId, taskId }
}

describe('task tables', () => {
  it('creates projects, tasks and events', async () => {
    const r = await ctx.db.execute(sql`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_name in ('projects','tasks','events')
    `)
    expect((r.rows as { table_name: string }[]).map((x) => x.table_name).sort()).toEqual([
      'events',
      'projects',
      'tasks',
    ])
  })

  it('stores scheduled_on as a date and due_at as timestamptz', async () => {
    const cols = await columns('tasks')
    const by = (n: string) => cols.find((c) => c.column_name === n)
    expect(by('scheduled_on')?.data_type).toBe('date')
    expect(by('due_at')?.data_type).toBe('timestamp with time zone')
  })

  it('stores every other tasks timestamp as timestamptz', async () => {
    const cols = await columns('tasks')
    for (const n of ['completed_at', 'deleted_at', 'created_at', 'updated_at']) {
      expect(cols.find((c) => c.column_name === n)?.data_type, n).toBe('timestamp with time zone')
    }
  })

  it('constrains status to exactly the TASK_STATUSES set', async () => {
    const r = await ctx.db.execute(sql`
      select pg_get_constraintdef(oid) as def from pg_constraint
      where conrelid = 'tasks'::regclass and contype = 'c' and conname = 'tasks_status_check'
    `)
    const def = (r.rows as { def: string }[])[0]!.def
    // The check must be on the status column, not some other one.
    expect(def).toMatch(/^CHECK \(\(?status\b/)
    const allowed = [...def.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort()
    expect(allowed).toEqual([...TASK_STATUSES].sort())
  })

  it('rejects a task whose status is outside the set', async () => {
    const { workspaceId, projectId } = await seed()
    expect(
      await sqlStateOf(
        ctx.db.execute(sql`
        insert into tasks (id, workspace_id, project_id, title, status, rank)
        values (gen_random_uuid(), ${workspaceId}, ${projectId}, 't', 'archived', 'a0')
      `),
      ),
    ).toBe(CHECK_VIOLATION)
    await expect(
      ctx.db.execute(sql`
        insert into tasks (id, workspace_id, project_id, title, status, rank)
        values (gen_random_uuid(), ${workspaceId}, ${projectId}, 't', 'in_progress', 'a0')
      `),
    ).resolves.toBeDefined()
  })

  it('requires project_id but allows a null parent_id', async () => {
    const cols = await columns('tasks')
    expect(cols.find((c) => c.column_name === 'project_id')?.is_nullable).toBe('NO')
    expect(cols.find((c) => c.column_name === 'parent_id')?.is_nullable).toBe('YES')
  })

  // The rank's lexicographic order only matches its logical order under bytewise comparison
  // (COLLATE "C"). We assert the column's declared collation rather than an ordering, because the
  // Alpine test container's default collation already coincides with bytewise, so an ordering
  // assertion could not fail here while still being wrong on glibc Postgres.
  // The other half: the ranks themselves must sort bytewise in the order they were placed.
  it('generates ranks that sort bytewise in placement order', () => {
    const ranks: string[] = []
    for (let i = 0; i < 100; i++) ranks.push(rankBetween(ranks.at(-1) ?? null, null))
    for (let i = 0; i < 100; i++) ranks.unshift(rankBetween(null, ranks[0]!))
    expect([...ranks].sort()).toEqual(ranks)
  })

  it.each(['tasks', 'projects'])('declares rank COLLATE "C" on %s', async (table) => {
    const r = await ctx.db.execute(sql`
      select collation_name from information_schema.columns
      where table_schema = 'public' and table_name = ${table} and column_name = 'rank'
    `)
    expect((r.rows as { collation_name: string | null }[])[0]!.collation_name).toBe('C')
  })

  it('cascades tasks when their project is removed', async () => {
    const r = await ctx.db.execute(sql`
      select confdeltype from pg_constraint
      where conrelid = 'tasks'::regclass and contype = 'f'
        and confrelid = 'projects'::regclass
    `)
    expect((r.rows as { confdeltype: string }[])[0]!.confdeltype).toBe('c')
  })

  // Hard-deleting a task must not silently erase its history: refuse it loudly.
  it('keeps a task, its parent and its dependencies in one workspace', async () => {
    const mine = await seed()
    const theirs = await seed()
    const refused = (q: ReturnType<typeof sql>) => sqlStateOf(ctx.db.execute(q))
    // A task filed in their project, or under their task, from my workspace.
    expect(
      await refused(sql`
        insert into tasks (id, workspace_id, project_id, title, status, rank)
        values (gen_random_uuid(), ${mine.workspaceId}, ${theirs.projectId}, 't', 'todo', 'a0')
      `),
    ).toBe(FOREIGN_KEY_VIOLATION)
    expect(
      await refused(sql`
        insert into tasks (id, workspace_id, project_id, parent_id, title, status, rank)
        values (gen_random_uuid(), ${mine.workspaceId}, ${mine.projectId}, ${theirs.taskId},
                't', 'todo', 'a0')
      `),
    ).toBe(FOREIGN_KEY_VIOLATION)
    // My task waiting for theirs.
    expect(
      await refused(sql`
        insert into task_dependencies (blocker_id, blocked_id, workspace_id)
        values (${theirs.taskId}, ${mine.taskId}, ${mine.workspaceId})
      `),
    ).toBe(FOREIGN_KEY_VIOLATION)
    // An event names its thing by type and id, with no foreign key to hold it to a workspace:
    // the log is read through the workspace, never through the thing (RFC-001 2.3).
  })

  it('removes projects, tasks and events when their workspace is deleted', async () => {
    const { workspaceId, projectId, taskId } = await seed()
    await ctx.db.execute(sql`delete from workspaces where id = ${workspaceId}`)
    expect(await count('projects', 'id', projectId)).toBe(0)
    expect(await count('tasks', 'id', taskId)).toBe(0)
    expect(await count('events', 'workspace_id', workspaceId)).toBe(0)
  })
})
