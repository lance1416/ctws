import { type DependencyRef, type ProjectId, type TaskId, type WorkspaceId } from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import type { Queryable } from '../../../platform/db/client'
import { scoped } from '../../../platform/db/scope'
import { ident } from '../../../platform/db/sql'
import { taskDependencies } from '../tables'
import { groupBy } from '../../../platform/values'
import { taskFinishedSql, taskOpenSql, visibleTasks, visibleTask } from './scope'

type RefRow = {
  id: TaskId
  title: string
  project_id: ProjectId
  project_name: string
  done: boolean
}

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
  workspaceId: WorkspaceId,
  taskId: TaskId,
): Promise<{ blockedBy: DependencyRef[]; blocks: DependencyRef[] }> {
  await visibleTask(q, workspaceId, taskId)
  const query = (other: 'blocker_id' | 'blocked_id', self: 'blocked_id' | 'blocker_id') => sql`
    select
      t.id, t.title, p.id as project_id, p.name as project_name,
      (${taskFinishedSql('t')}) as done
    from task_dependencies d
    join tasks t on t.id = d.${ident(other)}
    join projects p on p.id = t.project_id
    where d.${ident(self)} = ${taskId}
      and ${scoped(taskDependencies, workspaceId, 'd')}
      and ${visibleTasks(workspaceId, { task: 't', project: 'p' })}
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
  workspaceId: WorkspaceId,
  taskIds: readonly TaskId[],
): Promise<Map<TaskId, DependencyRef[]>> {
  if (taskIds.length === 0) return new Map()
  const rows = await q.execute(sql`
    select
      d.blocked_id,
      t.id, t.title, p.id as project_id, p.name as project_name, false as done
    from task_dependencies d
    join tasks t on t.id = d.blocker_id
    join projects p on p.id = t.project_id
    where ${scoped(taskDependencies, workspaceId, 'd')}
      and d.blocked_id in ${taskIds}
      and ${visibleTasks(workspaceId, { task: 't', project: 'p' })}
      and ${taskOpenSql('t')}
    order by p.rank, t.rank, t.id
  `)
  return groupBy(rows.rows as (RefRow & { blocked_id: TaskId })[], (r) => r.blocked_id, toRef)
}
