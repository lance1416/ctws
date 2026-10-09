import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { Queryable } from '../db/client'
import { LIKE_ESCAPE, likePattern } from '../db/like'
import { projects, tasks } from '../db/schema'
import type { Linkable, StoredEdge } from '../links/linkable'
import { visibleProjects } from '../projects/store'

/**
 * THE TENANT CHOKEPOINT for everything below. A task has no workspace of its own: it is scoped
 * through its project, which is also what makes the project column worth keeping as a column.
 */
const ofWorkspace = (q: Queryable, workspaceId: string) =>
  q
    .select({ id: tasks.id, title: tasks.title, status: tasks.status, projectId: tasks.projectId })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .$dynamic()

const visible = (workspaceId: string) => and(visibleProjects(workspaceId), isNull(tasks.deletedAt))

/**
 * 任务 names its own tasks, AND reports its project column as an edge.
 *
 * `tasks.project_id` is NOT NULL and the task tree is built on it: every query in the module
 * reaches for it, and a nullable edge in its place would be a rewrite of the module to gain
 * nothing. So the column stays, and the module hands the shell the same shape the edge table
 * produces -- an object page sees one uniform set of edges whichever way they are stored.
 */
export const taskLinkable: Linkable = {
  type: 'task',
  label: 'Tasks',
  name: async (q, workspaceId, ids) => {
    const rows = await ofWorkspace(q, workspaceId).where(
      and(visible(workspaceId), inArray(tasks.id, [...ids])),
    )
    return new Map(
      rows.map((r) => [r.id, { title: r.title, detail: r.status === 'done' ? 'Done' : null }]),
    )
  },
  find: async (q, workspaceId, text, limit) => {
    const rows = await ofWorkspace(q, workspaceId)
      .where(
        and(
          visible(workspaceId),
          text === ''
            ? undefined
            : sql`tasks.title ilike ${likePattern(text)} escape ${LIKE_ESCAPE}`,
        ),
      )
      .orderBy(desc(tasks.createdAt), desc(tasks.id))
      .limit(limit)
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      detail: r.status === 'done' ? 'Done' : null,
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
      const rows = await ofWorkspace(q, workspaceId).where(
        and(visible(workspaceId), eq(tasks.id, of.id)),
      )
      return rows.map((r) => edge(r.id, r.projectId))
    }
    if (of.type === 'project') {
      // Every task of the project, open or not: the page groups them and says which are done. The
      // cap is the shell's, and it is the same cap every group on the page gets.
      const rows = await ofWorkspace(q, workspaceId).where(
        and(visible(workspaceId), eq(tasks.projectId, of.id)),
      )
      return rows.map((r) => edge(r.id, r.projectId))
    }
    return []
  },
}
