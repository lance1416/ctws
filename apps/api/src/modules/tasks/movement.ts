import { and, asc, desc, isNull, sql } from 'drizzle-orm'
import type { Queryable } from '../../platform/db/client'
import { projects } from '../../shell/projects/tables'
import { visibleProjects } from '../../shell/projects/store'

/**
 * One line of Movement: what a project MOVED, never how "complete" it is.
 *
 * There is deliberately no ratio here. Rollup is M3 and nothing in this codebase writes
 * `manual_progress`, so a percentage would be a number the backend cannot honour -- a bar drawn
 * against a column that is null for every row in the database. What a person can actually act on
 * is movement: how many finished this week, how many are left, and how long the line has been
 * quiet.
 */
export type ProjectMovement = {
  projectId: string
  projectName: string
  /** Finished since the start of the current week IN THE USER'S TIMEZONE (weeks start Monday). */
  doneThisWeek: number
  /** Still open: neither done, cancelled nor deleted. Same definition as the rail's count. */
  remaining: number
  /**
   * Still open and past its deadline: `due_at` before the start of TODAY in the user's zone,
   * which is exactly the `overdue` segment `listToday` computes. The two must agree, or the
   * project banner and the Overdue panel would disagree about the same task.
   */
  overdue: number
  /** The calendar day of the last logged change, in the user's timezone; null if nothing ever happened. */
  lastActivityOn: string | null
  /** Whole days from that day to today, in the user's timezone. Null when there is no activity. */
  quietDays: number | null
  /**
   * The day the next deadline still standing falls on, in the user's timezone: the earliest open
   * task's deadline from the start of today on. Null when nothing open has one. What a project
   * line says when nothing in it is late yet.
   */
  nextDueOn: string | null
}

/**
 * Per-project movement for the whole workspace, in ONE round trip.
 *
 * Modelled on `listToday` / `listCompleted` for its rules, and on `listProjects` for its shape:
 *
 *   - **Scoped through the tenant chokepoint.** The predicate is `visibleProjects(workspaceId)`
 *     from the shell's project store, not a hand-rolled `workspace_id = …`: that is the one
 *     place scoping and soft-delete filtering live, and a module does not get its own copy.
 *   - **The week and the day are the USER"S, not the server's.** `date_trunc("week', …)` is
 *     applied to the local timestamp and converted back, so a task finished at 23:30 on Sunday
 *     local does not count towards next week because the database runs in UTC.
 *   - **Archived projects are out.** Archiving sets a line of work aside; it has no business
 *     reporting that it has been quiet for 40 days. Deleted ones are out via the chokepoint.
 *   - **Activity is the EVENT LOG, not `updated_at`.** A pure reorder writes no event by design
 *     (contracts, section 9.1), so a tidy-up cannot make a dead project look alive -- which is
 *     the whole value of the stagnation line.
 *
 * The correlated subqueries spell their table references with literal, ALIASED names rather than
 * `${tasks.projectId}`: drizzle interpolates a column reference UNQUALIFIED, so
 * `${tasks.projectId} = ${projects.id}` renders as `"project_id" = "id"`, which binds `"id"` to
 * the subquery's own row, correlates a task to itself and silently counts zero. That bug has
 * been paid for once here already (see `listProjects`).
 */
export async function listProjectMovement(
  q: Queryable,
  workspaceId: string,
  timezone: string,
  // Exists only so the week boundary and the day arithmetic can be tested at fixed instants.
  // Production callers omit it and get the database's clock.
  now?: Date,
): Promise<ProjectMovement[]> {
  const clock = now ? sql`${now.toISOString()}::timestamptz` : sql`now()`
  // Monday 00:00 of the current week, in the user's zone, as an instant. The "+ 1 day"-style trap
  // `listToday` documents does not arise here (no interval is added to a timestamptz), but the
  // conversion order is the same: truncate the LOCAL timestamp, then convert back.
  const weekStart = sql`((date_trunc('week', ${clock} at time zone ${timezone})) at time zone ${timezone})`
  const today = sql`((${clock} at time zone ${timezone})::date)`
  // Midnight of the user's today, as an instant. Same expression `listToday` calls `t0`, and the
  // same conversion order: truncate the LOCAL timestamp, then convert back.
  const dayStart = sql`((date_trunc('day', ${clock} at time zone ${timezone})) at time zone ${timezone})`
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
          and done_t.completed_at >= ${weekStart}
      )`.mapWith(Number),
      remaining: sql<number>`(
        select count(*) from tasks open_t
        where open_t.project_id = projects.id
          and open_t.deleted_at is null
          and open_t.status not in ('done', 'cancelled')
      )`.mapWith(Number),
      overdue: sql<number>`(
        select count(*) from tasks late_t
        where late_t.project_id = projects.id
          and late_t.deleted_at is null
          and late_t.status not in ('done', 'cancelled')
          and late_t.due_at is not null
          and late_t.due_at < ${dayStart}
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
          and next_t.status not in ('done', 'cancelled')
          and next_t.due_at >= ${dayStart}
      ) at time zone ${timezone})::date)::text`,
    })
    .from(projects)
    .where(and(visibleProjects(workspaceId), isNull(projects.archivedAt)))
    // The same order the rail and the project list use, so one project is in one place everywhere.
    .orderBy(desc(projects.isInbox), asc(projects.rank), asc(projects.id))

  return rows.map((r) => ({
    projectId: r.projectId,
    projectName: r.projectName,
    doneThisWeek: r.doneThisWeek,
    remaining: r.remaining,
    overdue: r.overdue,
    lastActivityOn: r.lastActivityOn ?? null,
    quietDays: r.quietDays === null || r.quietDays === undefined ? null : Number(r.quietDays),
    nextDueOn: r.nextDueOn ?? null,
  }))
}
