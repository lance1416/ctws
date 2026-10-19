import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { migratedTo } from '../../helpers/db'

/**
 * TASKS TOOK THEIR PROJECT'S WORKSPACE, so the rows that hang off a task can be held to it by a
 * foreign key. A fresh database has no tasks when the column arrives; only one that already holds
 * them shows whether each got its project's workspace and the keys went on over them.
 */
const stops: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const stop of stops.splice(0)) await stop()
})

describe('the workspace keys migration', () => {
  it('gives every existing task its project workspace and keeps its edges and events', async () => {
    const at = await migratedTo('0023_workspace_write_only')
    stops.push(at.stop)

    const ws = randomUUID()
    const project = randomUUID()
    const [parent, child] = [randomUUID(), randomUUID()]
    await at.db.execute(sql`insert into workspaces (id) values (${ws})`)
    await at.db.execute(sql`
      insert into projects (id, workspace_id, name, rank, color)
      values (${project}, ${ws}, 'p', 'a0', 'project-1')`)
    await at.db.execute(sql`
      insert into tasks (id, project_id, parent_id, title, status, rank) values
        (${parent}, ${project}, null, 'parent', 'todo', 'a0'),
        (${child}, ${project}, ${parent}, 'child', 'todo', 'a0')`)
    await at.db.execute(sql`
      insert into task_dependencies (blocker_id, blocked_id, workspace_id)
      values (${parent}, ${child}, ${ws})`)
    await at.db.execute(sql`
      insert into task_events (id, task_id, workspace_id, type, payload, occurred_at)
      values (${randomUUID()}, ${child}, ${ws}, 'created', '{}', now())`)

    await at.migrateRest()

    const tasks = await at.db.execute(sql`select id, workspace_id from tasks order by title`)
    expect(tasks.rows).toEqual([
      { id: child, workspace_id: ws },
      { id: parent, workspace_id: ws },
    ])
    const kept = await at.db.execute(sql`
      select (select count(*)::int from task_dependencies) as dependencies,
             (select count(*)::int from events where object_type = 'task') as events`)
    expect(kept.rows[0]).toEqual({ dependencies: 1, events: 1 })
  })
})
