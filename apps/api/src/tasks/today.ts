import { sql } from 'drizzle-orm'
import type { TodaySegment } from '@ctws/contracts'
import type { Queryable } from '../db/client'
import type { Task } from './tasks'
import { asDate, taskRowOf } from './rows'

export type TodayTask = Task & {
  projectName: string
  parentTitle: string | null
  segment: TodaySegment
}

/**
 * The cross-project "what am I doing today" list. One query, and the segment is decided HERE
 * rather than by the client, for two reasons:
 *
 *   - **The segments must be mutually exclusive.** A task can be both overdue and in_progress.
 *     If each segment were filtered independently the task would render twice, which reads as
 *     "did I create this twice?" and invites the user to delete a real task.
 *   - **"Today" depends on the user's timezone, not the server's.** Getting it wrong raises no
 *     error; the task simply shows up in the wrong segment and the user assumes they
 *     misremembered. `scheduled_on` is a calendar day, so it compares against the local date;
 *     `due_at` is an instant, so it compares against the local day's boundaries.
 *
 * `scheduled_on <= today` (not `= today`) is deliberate: something scheduled yesterday and not
 * done keeps showing up instead of silently vanishing. A list that loses tasks cannot be trusted.
 */
export async function listToday(
  q: Queryable,
  workspaceId: string,
  timezone: string,
  // Exists only so the timezone and DST arithmetic below can be tested at fixed instants.
  // Production callers omit it and get the database's clock.
  now?: Date,
): Promise<TodayTask[]> {
  const clock = now ? sql`${now.toISOString()}::timestamptz` : sql`now()`
  // Columns are listed explicitly (not `t.*`) so `scheduled_on` can be cast to text: node-postgres
  // would otherwise parse a `date` into a JS Date at server-local midnight, the same timezone
  // bug this endpoint exists to avoid.
  const result = await q.execute(sql`
    with bounds as (
      select
        (date_trunc('day', ${clock} at time zone ${timezone}) at time zone ${timezone}) as t0,
        -- The "+ 1 day" MUST happen on the naive local timestamp, before converting back. Adding
        -- the interval to the timestamptz instead does the arithmetic in the DB session's zone,
        -- where a day is always 24h, so on a DST change day (23h or 25h in the user's zone) t1
        -- lands an hour off and a task due in that hour drops out of "today".
        ((date_trunc('day', ${clock} at time zone ${timezone}) + interval '1 day')
          at time zone ${timezone}) as t1,
        (${clock} at time zone ${timezone})::date as today
    ),
    picked as (
      select
        t.id, t.project_id, t.parent_id, t.title, t.notes, t.status,
        t.scheduled_on::text as scheduled_on,
        t.due_at, t.rank, t.manual_progress, t.completed_at, t.deleted_at,
        t.created_at, t.updated_at,
        p.name as project_name,
        p.rank as project_rank,
        parent.title as parent_title,
        case
          when t.due_at is not null and t.due_at < b.t0 then 'overdue'
          when (t.scheduled_on is not null and t.scheduled_on <= b.today)
            or (t.due_at >= b.t0 and t.due_at < b.t1) then 'today'
          else 'in_progress'
        end as segment
      from tasks t
      join projects p on p.id = t.project_id
      join bounds b on true
      left join tasks parent on parent.id = t.parent_id
      where p.workspace_id = ${workspaceId}
        and p.deleted_at is null
        -- Archiving sets a project aside, so its tasks do not belong on "what am I doing today".
        and p.archived_at is null
        and t.deleted_at is null
        and t.status not in ('done', 'cancelled')
        and (
          (t.due_at is not null and t.due_at < b.t1)
          or (t.scheduled_on is not null and t.scheduled_on <= b.today)
          or t.status = 'in_progress'
        )
    )
    select * from picked
    order by
      case segment when 'overdue' then 0 when 'today' then 1 else 2 end,
      -- Within a segment only that segment's key is non-null, so the others are inert.
      case when segment = 'overdue' then due_at end asc,
      case when segment = 'today' then due_at end asc nulls last,
      case when segment = 'in_progress' then updated_at end desc,
      project_rank, rank, id
  `)
  return (result.rows as Record<string, unknown>[]).map(rowToTodayTask)
}

// drizzle's node-postgres driver hands raw timestamptz values back as strings from a raw
// `execute`, unlike a typed `select`, so they are normalised to Date to match `Task`.

function rowToTodayTask(r: Record<string, unknown>): TodayTask {
  return {
    ...taskRowOf(r),
    segment: r.segment as TodaySegment,
  }
}
