import { idFrom, projectId, type ProjectId, taskId, type TaskId } from '@ctws/contracts'
import { desc, eq, sql } from 'drizzle-orm'
import type { Queryable } from '../../platform/db/client'
import { within } from '../../platform/db/scope'
import { ident } from '../../platform/db/sql'
import { wanted, type Linkable, type StoredEdge } from '../../shell/links/linkable'
import { projectNameOf } from '../../shell/projects'
import { visibleTask } from './queries/scope'
import { tasks } from './tables'

const taskRows = (q: Queryable) =>
  q
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      projectId: tasks.projectId,
      projectName: projectNameOf(sql`${ident('tasks')}.project_id`),
    })
    .from(tasks)
    .$dynamic()

const belongs = (id: TaskId, projectId: ProjectId): StoredEdge => ({
  fromType: 'task',
  fromId: id,
  toType: 'project',
  toId: projectId,
  kind: 'belongs',
})

/**
 * A task's project is a column, not a link row; `own` reports it in the edge shape so an object
 * page reads one set of edges either way.
 */
export const taskLinkable: Linkable = {
  type: 'task',
  label: 'Tasks',
  rows: async (q, workspaceId, want) => {
    const { where, limit } = wanted(want, tasks.id, ['tasks.title'])
    const found = await taskRows(q)
      .where(within(visibleTask(workspaceId), where))
      .orderBy(desc(tasks.createdAt), desc(tasks.id))
      .limit(limit)
    // Every reader is cross-project, so the detail names the project.
    return found.map((r) => ({
      id: r.id,
      title: r.title,
      detail: r.status === 'done' ? `${r.projectName} · Done` : r.projectName,
    }))
  },
  own: async (q, workspaceId, of) => {
    if (of.type !== 'task' && of.type !== 'project') return []
    // A link's end is any kind of id; its type says which this one is.
    const where =
      of.type === 'task'
        ? eq(tasks.id, idFrom(taskId, of.id))
        : eq(tasks.projectId, idFrom(projectId, of.id))
    const rows = await taskRows(q).where(within(visibleTask(workspaceId), where))
    return rows.map((r) => belongs(r.id, r.projectId))
  },
}
