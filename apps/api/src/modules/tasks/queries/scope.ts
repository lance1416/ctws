import { FINISHED_TASK_STATUSES, type WorkspaceId, type TaskId } from '@ctws/contracts'
import { eq, sql, type SQL } from 'drizzle-orm'
import type { Queryable, Tx } from '../../../platform/db/client'
import { liveUnder, type Scope, within } from '../../../platform/db/scope'
import { ident, sqlValues } from '../../../platform/db/sql'
import { inLiveProject, projectScope } from '../../../shell/projects'
import { tasks, type Task } from '../tables'
import { isLeafSql } from './rows'
import { NotFound } from '../../../platform/errors'

/** How a raw query names the task table and the project table joined to it: `t` and `p`. */
type Aliases = { task: string; project: string }

/**
 * A live task in a project this workspace can see, for raw SQL that joins the task's project; a
 * task has no workspace of its own, so the project decides.
 */
export const visibleTasks = (workspaceId: WorkspaceId, as: Aliases): Scope =>
  liveUnder(as.task, projectScope(workspaceId, as.project))

/** `visibleTasks`, for a query builder over `tasks` alone. */
const visibleTask = (workspaceId: WorkspaceId): Scope =>
  liveUnder('tasks', inLiveProject(workspaceId, sql`${ident('tasks')}.project_id`))

const FINISHED = sqlValues(FINISHED_TASK_STATUSES)

/** The task under the alias is done or cancelled. */
export const taskFinishedSql = (task: string): SQL => sql`${ident(task)}.status in (${FINISHED})`

/** The task under the alias is still open. */
export const taskOpenSql = (task: string): SQL => sql`${ident(task)}.status not in (${FINISHED})`

/**
 * The task under the alias is OVERDUE (FR-079): open, its deadline before the day that starts at
 * `dayStarts`, and not planned for `today` or a later day. Planning a late task for a day takes it
 * out until that day has gone by with it still open; its deadline stays as it was.
 */
export const overdueSql = (task: string, { dayStarts, today }: { dayStarts: SQL; today: SQL }) =>
  sql`(
    ${taskOpenSql(task)}
    and ${ident(task)}.due_at is not null
    and ${ident(task)}.due_at < ${dayStarts}
    and (${ident(task)}.scheduled_on is null or ${ident(task)}.scheduled_on < ${today})
  )`

/**
 * How many live open leaves the project `projectId` names has: a parent organises the work under
 * it, and is not one more thing open (FR-037). The project list correlates it through the literal
 * `projects.id`: a drizzle column would render unqualified.
 */
export const openTaskCountSql = (projectId: SQL = sql`projects.id`) =>
  sql<number>`(
    select count(*) from tasks open_t
    where open_t.project_id = ${projectId}
      and open_t.deleted_at is null
      and ${taskOpenSql('open_t')}
      and ${isLeafSql('open_t')}
  )`.mapWith(Number)

const byId = (q: Queryable, workspaceId: WorkspaceId, id: TaskId) =>
  q
    .select()
    .from(tasks)
    .where(within(visibleTask(workspaceId), eq(tasks.id, id)))
    .$dynamic()

/** One visible task. Missing, deleted and foreign ids all read as not found. */
export async function getTask(q: Queryable, workspaceId: WorkspaceId, id: TaskId): Promise<Task> {
  const [row] = await byId(q, workspaceId, id)
  if (!row) throw new NotFound('Task')
  return row
}

/** `getTask`, with the row locked for the rest of the transaction. */
export async function lockTask(q: Tx, workspaceId: WorkspaceId, id: TaskId): Promise<Task> {
  const [row] = await byId(q, workspaceId, id).for('update')
  if (!row) throw new NotFound('Task')
  return row
}
