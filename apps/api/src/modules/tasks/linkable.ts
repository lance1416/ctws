import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import type { Queryable } from '../../platform/db/client'
import { textMatches } from '../../platform/db/sql'
import { projects, tasks } from '../../platform/db/schema'
import type { Linkable, StoredEdge } from '../../shell/links/linkable'
import { visibleProjects } from '../../shell/projects/store'

/**
 * The columns every read here wants, joined to `projects` so the predicate below can reach a
 * workspace: a task has no workspace of its own, which is what makes the project column worth
 * keeping as a column.
 */
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

/** THE TENANT CHOKEPOINT: every read below goes through it, so no path can forget the scope. */
const visible = (workspaceId: string) => and(visibleProjects(workspaceId), isNull(tasks.deletedAt))

/**
 * TASKS names its own tasks, AND reports its project column as an edge.
 *
 * `tasks.project_id` is NOT NULL and the task tree is built on it: every query in the module
 * reaches for it, and a nullable edge in its place would be a rewrite of the module to gain
 * nothing. So the column stays, and the module hands the shell the same shape the edge table
 * produces -- an object page sees one uniform set of edges whichever way they are stored.
 */
export const taskLinkable: Linkable = {
  type: 'task',
  label: 'Tasks',
  rows: async (q, workspaceId, want) => {
    const found = await taskRows(q)
      .where(
        and(
          visible(workspaceId),
          'ids' in want
            ? inArray(tasks.id, [...want.ids])
            : want.text === ''
              ? undefined
              : textMatches(['tasks.title'], want.text),
        ),
      )
      .orderBy(desc(tasks.createdAt), desc(tasks.id))
      .limit('ids' in want ? want.ids.length : want.limit)
    // WHICH PROJECT, because every surface that reads this is a cross-project one: the picker
    // searches the whole workspace, and a person's page lists tasks from anywhere. Two tasks of
    // the same name are otherwise one row repeated. A finished one says so as well -- the same
    // `·` the rows use, so one line carries both facts.
    return found.map((r) => ({
      id: r.id,
      title: r.title,
      detail: r.status === 'done' ? `${r.projectName} · Done` : r.projectName,
    }))
  },
  own: async (q, workspaceId, of): Promise<StoredEdge[]> => {
    const edge = (id: string, projectId: string): StoredEdge => ({
      fromType: 'task',
      fromId: id,
      toType: 'project',
      toId: projectId,
      kind: 'belongs',
    })
    if (of.type === 'task') {
      const rows = await taskRows(q).where(and(visible(workspaceId), eq(tasks.id, of.id)))
      return rows.map((r) => edge(r.id, r.projectId))
    }
    if (of.type === 'project') {
      // Every task of the project, open or not: the page groups them and says which are done. The
      // cap is the shell's, and it is the same cap every group on the page gets.
      const rows = await taskRows(q).where(and(visible(workspaceId), eq(tasks.projectId, of.id)))
      return rows.map((r) => edge(r.id, r.projectId))
    }
    return []
  },
}
