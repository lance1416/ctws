import { and, eq, isNull, sql, type SQL } from 'drizzle-orm'
import type { Queryable } from '../../../platform/db/client'
import { ident } from '../../../platform/db/sql'
import { projectVisibleSql, visibleProjects } from '../../../shell/projects/queries'
import { projects } from '../../../shell/projects/tables'
import { TaskNotFoundError } from '../errors'
import { tasks, type Task } from '../tables'

/**
 * A live task in a project this workspace can see; a task has no workspace of its own. Needs
 * `projects` joined.
 */
export const visibleTasks = (workspaceId: string): SQL =>
  and(isNull(tasks.deletedAt), visibleProjects(workspaceId))!

/** The same predicate for raw SQL over the aliases `task` and `project`. */
export const taskVisibleSql = (task: string, project: string, workspaceId: string): SQL =>
  sql`${ident(task)}.deleted_at is null and ${projectVisibleSql(project, workspaceId)}`

const byId = (q: Queryable, workspaceId: string, id: string) =>
  q
    .select({ task: tasks })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(eq(tasks.id, id), visibleTasks(workspaceId)))
    .$dynamic()

/** One visible task. Missing, deleted and foreign ids all read as not found. */
export async function visibleTask(q: Queryable, workspaceId: string, id: string): Promise<Task> {
  const [row] = await byId(q, workspaceId, id)
  if (!row) throw new TaskNotFoundError()
  return row.task
}

/** One visible task, locked for the rest of the transaction. */
export async function lockVisibleTask(
  q: Queryable,
  workspaceId: string,
  id: string,
): Promise<Task> {
  const [row] = await byId(q, workspaceId, id).for('update', { of: tasks })
  if (!row) throw new TaskNotFoundError()
  return row.task
}
