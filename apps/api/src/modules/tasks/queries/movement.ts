import { asc, desc, isNull, sql } from 'drizzle-orm'
import { type ProjectMovementResponse, type WorkspaceId } from '@ctws/contracts'
import type { Queryable } from '../../../platform/db/client'
import { scoped, within } from '../../../platform/db/scope'
import { dayStart, localDay, weekStart } from '../../../platform/db/time'
import { projects } from '../../../shell/projects/tables'
import { openTaskCountSql, taskOpenSql } from './scope'

/**
 * How each unarchived project moved: finished this week, still open, overdue, and how long since
 * its last logged change (the event log, so a reorder does not count). Weeks and days are the
 * account's. The subqueries name tables by literal alias: a drizzle column would render
 * unqualified and correlate a task with itself.
 */
export async function listProjectMovement(
  q: Queryable,
  workspaceId: WorkspaceId,
  timezone: string,
  now: Date,
): Promise<ProjectMovementResponse[]> {
  const thisWeek = weekStart(now, timezone)
  const today = localDay(now, timezone)
  const todayStarts = dayStart(now, timezone)
  const lastActivity = sql`(
    select max(ev.occurred_at)
    from task_events ev
    join tasks ev_t on ev_t.id = ev.task_id
    where ev_t.project_id = projects.id
  )`

  const rows = await q
    .select({
      projectId: projects.id,
      projectName: projects.name,
      doneThisWeek: sql<number>`(
        select count(*) from tasks done_t
        where done_t.project_id = projects.id
          and done_t.deleted_at is null
          and done_t.status = 'done'
          and done_t.completed_at is not null
          and done_t.completed_at >= ${thisWeek}
      )`.mapWith(Number),
      remaining: openTaskCountSql(),
      overdue: sql<number>`(
        select count(*) from tasks late_t
        where late_t.project_id = projects.id
          and late_t.deleted_at is null
          and ${taskOpenSql('late_t')}
          and late_t.due_at is not null
          and late_t.due_at < ${todayStarts}
      )`.mapWith(Number),
      lastActivityOn: sql<
        string | null
      >`(((${lastActivity}) at time zone ${timezone})::date)::text`,
      quietDays: sql<
        number | null
      >`(${today} - ((${lastActivity}) at time zone ${timezone})::date)`,
      nextDueOn: sql<string | null>`(((
        select min(next_t.due_at) from tasks next_t
        where next_t.project_id = projects.id
          and next_t.deleted_at is null
          and ${taskOpenSql('next_t')}
          and next_t.due_at >= ${todayStarts}
      ) at time zone ${timezone})::date)::text`,
    })
    .from(projects)
    .where(within(scoped(projects, workspaceId), isNull(projects.archivedAt)))
    // The same order the rail and the project list use, so one project is in one place everywhere.
    .orderBy(desc(projects.isInbox), asc(projects.rank), asc(projects.id))

  return rows.map((r) => ({
    projectId: r.projectId,
    projectName: r.projectName,
    doneThisWeek: r.doneThisWeek,
    remaining: r.remaining,
    overdue: r.overdue,
    lastActivityOn: r.lastActivityOn ?? null,
    // At least 0: the database stamps events, and its clock may run past the app's today.
    quietDays: r.quietDays == null ? null : Math.max(0, Number(r.quietDays)),
    nextDueOn: r.nextDueOn ?? null,
  }))
}
