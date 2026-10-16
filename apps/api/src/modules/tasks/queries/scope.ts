import { FINISHED_TASK_STATUSES, type WorkspaceId, type TaskId } from '@ctws/contracts'
import { eq, sql, type SQL } from 'drizzle-orm'
import type { Queryable, Tx } from '../../../platform/db/client'
import { liveUnder, type Scope, scoped, within } from '../../../platform/db/scope'
import { ident, sqlValues } from '../../../platform/db/sql'
import { projects } from '../../../shell/projects/tables'
import { TaskNotFoundError } from '../errors'
import { tasks, type Task } from '../tables'

/** How a query names the task table and the project table joined to it. */
type Aliases = { task: string; project: string }

/** The query builder's names; raw SQL names them `t` and `p`. */
const BUILDER: Aliases = { task: 'tasks', project: 'projects' }

/**
 * A live task in a project this workspace can see; a task has no workspace of its own, so the
 * project is joined.
 */
export const visibleTasks = (workspaceId: WorkspaceId, as: Aliases = BUILDER): Scope =>
  liveUnder(as.task, scoped(projects, workspaceId, as.project))

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
    .where(within(visibleTasks(workspaceId), eq(tasks.id, id)))
    .$dynamic()

/** One visible task. Missing, deleted and foreign ids all read as not found. */
export async function getTask(q: Queryable, workspaceId: WorkspaceId, id: TaskId): Promise<Task> {
  const [row] = await byId(q, workspaceId, id)
  if (!row) throw new TaskNotFoundError()
  return row.task
}

/** `getTask`, with the row locked for the rest of the transaction. */
export async function lockTask(q: Tx, workspaceId: WorkspaceId, id: TaskId): Promise<Task> {
  const [row] = await byId(q, workspaceId, id).for('update', { of: tasks })
  if (!row) throw new TaskNotFoundError()
  return row.task
}
