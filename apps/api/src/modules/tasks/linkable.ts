import { type ProjectId, type TaskId, type TaskStatus, type WorkspaceId } from '@ctws/contracts'
import { desc, sql, type SQL } from 'drizzle-orm'
import type { Queryable } from '../../platform/db/client'
import { within } from '../../platform/db/scope'
import { wanted, type Linkable } from '../../shell/links'
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
      parentTitle: sql<string | null>`parent.title`,
      dueAt: tasks.dueAt,
      scheduledOn: tasks.scheduledOn,
    })
    .from(tasks)
    .innerJoin(sql`projects p`, sql`p.id = ${tasks.projectId}`)
    .leftJoin(sql`tasks parent`, sql`parent.id = ${tasks.parentId}`)
    .where(within(visibleTasks(workspaceId, { task: 'tasks', project: 'p' }), where))
    .$dynamic()

/**
 * A task as a list of things names it: every reader is cross-project, so with its project, and the
 * task it sits under.
 */
const named = (r: {
  id: TaskId
  title: string
  status: TaskStatus
  projectId: ProjectId
  projectName: string
  parentTitle: string | null
  dueAt: Date | null
  scheduledOn: string | null
}) => ({
  type: 'task' as const,
  id: r.id,
  title: r.title,
  status: r.status,
  projectId: r.projectId,
  projectName: r.projectName,
  parentTitle: r.parentTitle,
  dueAt: r.dueAt?.toISOString() ?? null,
  scheduledOn: r.scheduledOn,
})

const COLUMNS = { id: tasks.id, title: tasks.title, text: ['tasks.title'] }

/** Tasks by id or by title, each with the project it is in. */
export const taskLinkable: Linkable = {
  type: 'task',
  rows: async (q, workspaceId, want) => {
    const { where, orderBy, limit } = wanted(want, COLUMNS, [desc(tasks.createdAt), desc(tasks.id)])
    const found = await taskRows(q, workspaceId, where)
      .orderBy(...orderBy)
      .limit(limit)
    return found.map(named)
  },
}
