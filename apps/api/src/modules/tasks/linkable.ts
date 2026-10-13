import { and, desc, eq, inArray } from 'drizzle-orm'
import type { Queryable } from '../../platform/db/client'
import { textMatches } from '../../platform/db/sql'
import type { Linkable, StoredEdge } from '../../shell/links/linkable'
import { projects } from '../../shell/projects/tables'
import { visibleTasks } from './queries/scope'
import { tasks } from './tables'

const taskRows = (q: Queryable) =>
  q
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      projectId: tasks.projectId,
      projectName: projects.name,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .$dynamic()

const belongs = (id: string, projectId: string): StoredEdge => ({
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
    const found = await taskRows(q)
      .where(
        and(
          visibleTasks(workspaceId),
          'ids' in want
            ? inArray(tasks.id, [...want.ids])
            : want.text === ''
              ? undefined
              : textMatches(['tasks.title'], want.text),
        ),
      )
      .orderBy(desc(tasks.createdAt), desc(tasks.id))
      .limit('ids' in want ? want.ids.length : want.limit)
    // Every reader is cross-project, so the detail names the project.
    return found.map((r) => ({
      id: r.id,
      title: r.title,
      detail: r.status === 'done' ? `${r.projectName} · Done` : r.projectName,
    }))
  },
  own: async (q, workspaceId, of) => {
    if (of.type !== 'task' && of.type !== 'project') return []
    const column = of.type === 'task' ? tasks.id : tasks.projectId
    const rows = await taskRows(q).where(and(visibleTasks(workspaceId), eq(column, of.id)))
    return rows.map((r) => belongs(r.id, r.projectId))
  },
}
