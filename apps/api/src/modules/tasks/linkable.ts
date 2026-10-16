import { idFrom, projectId, taskId, type WorkspaceId } from '@ctws/contracts'
import { desc, eq, sql, type SQL } from 'drizzle-orm'
import type { Queryable } from '../../platform/db/client'
import { within } from '../../platform/db/scope'
import { byTitle, wanted, type Linkable } from '../../shell/links'
import { visibleTasks } from './queries'
import { tasks } from './tables'

/** Live tasks this workspace can see where `where` holds, each with its project's name. */
const taskRows = (q: Queryable, workspaceId: WorkspaceId, where: SQL | undefined) =>
  q
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      projectId: tasks.projectId,
      projectName: sql<string>`p.name`,
    })
    .from(tasks)
    .innerJoin(sql`projects p`, sql`p.id = ${tasks.projectId}`)
    .where(within(visibleTasks(workspaceId, { task: 'tasks', project: 'p' }), where))
    .$dynamic()

/** Every reader is cross-project, so the detail names the project. */
const detailOf = (r: { status: string; projectName: string }) =>
  r.status === 'done' ? `${r.projectName} · Done` : r.projectName

const COLUMNS = { id: tasks.id, title: tasks.title, text: ['tasks.title'] }

/** A task's project is a column, not a link row: `own` reads that edge from either end. */
export const taskLinkable: Linkable = {
  type: 'task',
  label: 'Tasks',
  rows: async (q, workspaceId, want) => {
    const { where, orderBy, limit } = wanted(want, COLUMNS, [desc(tasks.createdAt), desc(tasks.id)])
    const found = await taskRows(q, workspaceId, where)
      .orderBy(...orderBy)
      .limit(limit)
    return found.map((r) => ({ id: r.id, title: r.title, detail: detailOf(r) }))
  },
  own: {
    // A link's end is any kind of id; its type says which this one is.
    project: async (q, workspaceId, of) => {
      if (of.type !== 'task') return []
      const [task] = await taskRows(q, workspaceId, eq(tasks.id, idFrom(taskId, of.id)))
      if (!task) return []
      const project = { id: task.projectId, title: task.projectName, detail: null }
      return [{ ...project, kind: 'belongs', outgoing: true }]
    },
    task: async (q, workspaceId, of, limit) => {
      if (of.type !== 'project') return []
      const found = await taskRows(q, workspaceId, eq(tasks.projectId, idFrom(projectId, of.id)))
        .orderBy(...byTitle(tasks.title, tasks.id))
        .limit(limit)
      return found.map((r) => ({
        id: r.id,
        title: r.title,
        detail: detailOf(r),
        kind: 'belongs',
        outgoing: false,
      }))
    },
  },
}
