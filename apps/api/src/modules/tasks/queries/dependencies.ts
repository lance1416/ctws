import type { DependencyRef } from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import type { Queryable } from '../../../platform/db/client'
import { ident } from '../../../platform/db/sql'
import { taskVisibleSql } from './scope'

type RefRow = { id: string; title: string; project_id: string; project_name: string; done: boolean }

const toRef = (r: RefRow): DependencyRef => ({
  id: r.id,
  title: r.title,
  projectId: r.project_id,
  projectName: r.project_name,
  done: r.done,
})

/** Both directions for one task, finished blockers included: the detail pane shows them all. */
export async function taskDependencyLists(
  q: Queryable,
  workspaceId: string,
  taskId: string,
): Promise<{ blockedBy: DependencyRef[]; blocks: DependencyRef[] }> {
  const query = (other: 'blocker_id' | 'blocked_id', self: 'blocked_id' | 'blocker_id') => sql`
    select
      t.id, t.title, p.id as project_id, p.name as project_name,
      (t.status in ('done', 'cancelled')) as done
    from task_dependencies d
    join tasks t on t.id = d.${ident(other)}
    join projects p on p.id = t.project_id
    where d.${ident(self)} = ${taskId}
      and d.workspace_id = ${workspaceId}
      and ${taskVisibleSql('t', 'p', workspaceId)}
    order by p.rank, t.rank, t.id
  `
  const [up, down] = await Promise.all([
    q.execute(query('blocker_id', 'blocked_id')),
    q.execute(query('blocked_id', 'blocker_id')),
  ])
  return {
    blockedBy: (up.rows as RefRow[]).map(toRef),
    blocks: (down.rows as RefRow[]).map(toRef),
  }
}

/** What is still in the way of each task, keyed by the waiting task; unfinished blockers only. */
export async function blockersFor(
  q: Queryable,
  workspaceId: string,
  taskIds: readonly string[],
): Promise<Map<string, DependencyRef[]>> {
  const out = new Map<string, DependencyRef[]>()
  if (taskIds.length === 0) return out
  const rows = await q.execute(sql`
    select
      d.blocked_id,
      t.id, t.title, p.id as project_id, p.name as project_name, false as done
    from task_dependencies d
    join tasks t on t.id = d.blocker_id
    join projects p on p.id = t.project_id
    where d.workspace_id = ${workspaceId}
      and d.blocked_id in ${taskIds}
      and ${taskVisibleSql('t', 'p', workspaceId)}
      and t.status not in ('done', 'cancelled')
    order by p.rank, t.rank, t.id
  `)
  for (const row of rows.rows as (RefRow & { blocked_id: string })[]) {
    const list = out.get(row.blocked_id)
    if (list) list.push(toRef(row))
    else out.set(row.blocked_id, [toRef(row)])
  }
  return out
}
