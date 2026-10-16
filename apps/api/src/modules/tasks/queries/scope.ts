import { FINISHED_TASK_STATUSES, type WorkspaceId, type TaskId } from '@ctws/contracts'
import { and, eq, isNull, sql, type SQL } from 'drizzle-orm'
import type { Queryable, Tx } from '../../../platform/db/client'
import { ident, sqlValues } from '../../../platform/db/sql'
import { projectVisibleSql, visibleProjects } from '../../../shell/projects/queries'
import { projects } from '../../../shell/projects/tables'
import { TaskNotFoundError } from '../errors'
import { tasks, type Task } from '../tables'

/**
 * A live task in a project this workspace can see; a task has no workspace of its own. Needs
 * `projects` joined.
 */
export const visibleTasks = (workspaceId: WorkspaceId): SQL =>
  and(isNull(tasks.deletedAt), visibleProjects(workspaceId))!

/** The same predicate for raw SQL over the aliases `task` and `project`. */
export const taskVisibleSql = (task: string, project: string, workspaceId: WorkspaceId): SQL =>
  sql`${ident(task)}.deleted_at is null and ${projectVisibleSql(project, workspaceId)}`

const FINISHED = sqlValues(FINISHED_TASK_STATUSES)

/** The task under the alias is done or cancelled. */
export const taskFinishedSql = (task: string): SQL => sql`${ident(task)}.status in (${FINISHED})`

/** The task under the alias is still open. */
export const taskOpenSql = (task: string): SQL => sql`${ident(task)}.status not in (${FINISHED})`

/**
 * How many live open tasks a project has. Correlated through the literal `projects.id`: a drizzle
 * column would render unqualified.
 */
export const openTaskCountSql = () =>
  sql<number>`(
    select count(*) from tasks open_t
    where open_t.project_id = projects.id
      and open_t.deleted_at is null
      and ${taskOpenSql('open_t')}
  )`.mapWith(Number)

const byId = (q: Queryable, workspaceId: WorkspaceId, id: TaskId) =>
  q
    .select({ task: tasks })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(eq(tasks.id, id), visibleTasks(workspaceId)))
    .$dynamic()

/** One visible task. Missing, deleted and foreign ids all read as not found. */
export async function visibleTask(
  q: Queryable,
  workspaceId: WorkspaceId,
  id: TaskId,
): Promise<Task> {
  const [row] = await byId(q, workspaceId, id)
  if (!row) throw new TaskNotFoundError()
  return row.task
}

/** One visible task, locked for the rest of the transaction. */
export async function lockVisibleTask(q: Tx, workspaceId: WorkspaceId, id: TaskId): Promise<Task> {
  const [row] = await byId(q, workspaceId, id).for('update', { of: tasks })
  if (!row) throw new TaskNotFoundError()
  return row.task
}
