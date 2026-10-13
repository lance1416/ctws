import type { TodaySegment } from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import type { Queryable } from '../../../platform/db/client'
import { dayStart, localDay } from '../../../platform/db/time'
import { TASK_COLUMNS, taskRowOf, type TaskRow } from './rows'
import { taskVisibleSql } from './scope'

export type TodayTask = TaskRow & { segment: TodaySegment }

/**
 * Open tasks in unarchived projects that are in progress, planned up to today, or due before
 * tomorrow. Each falls in exactly one segment (overdue, then today, then in progress) so no row
 * shows twice; a plan from an earlier day stays until it is done.
 */
export async function listToday(
  q: Queryable,
  workspaceId: string,
  timezone: string,
  now: Date,
): Promise<TodayTask[]> {
  const result = await q.execute(sql`
    with bounds as (
      select
        ${dayStart(now, timezone)} as t0,
        ${dayStart(now, timezone, 1)} as t1,
        ${localDay(now, timezone)} as today
    ),
    picked as (
      select
        ${TASK_COLUMNS('t')},
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
      where ${taskVisibleSql('t', 'p', workspaceId)}
        and p.archived_at is null
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
      -- Within a segment only that segment's key is non-null.
      case when segment = 'overdue' then due_at end asc,
      case when segment = 'today' then due_at end asc nulls last,
      case when segment = 'in_progress' then updated_at end desc,
      project_rank, rank, id
  `)
  return (result.rows as Record<string, unknown>[]).map((r) => ({
    ...taskRowOf(r),
    segment: r.segment as TodaySegment,
  }))
}
