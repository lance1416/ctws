import { type ProjectMovementResponse, type WorkspaceId } from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Queryable } from '../../../platform/db/client'
import { rowsOf } from '../../../platform/db/raw'
import { dayStart, localDay, weekStart } from '../../../platform/db/time'
import { unarchivedProjects } from '../../../shell/projects'
import { openTaskCountSql, taskOpenSql } from './scope'

const movementRow = z.object({
  projectId: z.string(),
  doneThisWeek: z.coerce.number(),
  remaining: z.coerce.number(),
  overdue: z.coerce.number(),
  lastActivityOn: z.string().nullable(),
  quietDays: z.coerce.number().nullable(),
  nextDueOn: z.string().nullable(),
})

/**
 * How each unarchived project moved: finished this week, still open, overdue, and how long since
 * its last logged change (the event log, so a reorder does not count). Weeks and days are the
 * account's. The projects are the shell's; the counts are this module's, one row per project.
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
  const projects = await unarchivedProjects(q, workspaceId)
  if (projects.length === 0) return []
  const project = sql`m.project_id`
  const lastActivity = sql`(
    select max(ev.occurred_at)
    from task_events ev
    join tasks ev_t on ev_t.id = ev.task_id
    where ev_t.project_id = ${project}
  )`

  const result = await q.execute(sql`
    select
      m.project_id as "projectId",
      (
        select count(*) from tasks done_t
        where done_t.project_id = ${project}
          and done_t.deleted_at is null
          and done_t.status = 'done'
          and done_t.completed_at is not null
          and done_t.completed_at >= ${thisWeek}
      ) as "doneThisWeek",
      ${openTaskCountSql(project)} as remaining,
      (
        select count(*) from tasks late_t
        where late_t.project_id = ${project}
          and late_t.deleted_at is null
          and ${taskOpenSql('late_t')}
          and late_t.due_at is not null
          and late_t.due_at < ${todayStarts}
      ) as overdue,
      ((${lastActivity}) at time zone ${timezone})::date as "lastActivityOn",
      (${today} - ((${lastActivity}) at time zone ${timezone})::date) as "quietDays",
      (((
        select min(next_t.due_at) from tasks next_t
        where next_t.project_id = ${project}
          and next_t.deleted_at is null
          and ${taskOpenSql('next_t')}
          and next_t.due_at >= ${todayStarts}
      ) at time zone ${timezone})::date) as "nextDueOn"
    from unnest(array[${sql.join(
      projects.map((p) => sql`${p.id}`),
      sql`, `,
    )}]::uuid[]) as m(project_id)
  `)
  const moved = new Map(rowsOf(result, movementRow).map((r) => [r.projectId, r]))

  // The projects' own order, the one the rail and the project list use, so one project is in one
  // place everywhere.
  return projects.map((p) => {
    const r = moved.get(p.id)!
    return {
      projectId: p.id,
      projectName: p.name,
      doneThisWeek: r.doneThisWeek,
      remaining: r.remaining,
      overdue: r.overdue,
      lastActivityOn: r.lastActivityOn,
      quietDays: r.quietDays,
      nextDueOn: r.nextDueOn,
    }
  })
}
