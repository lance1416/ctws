import { todayTaskResponse, type WorkspaceId } from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import type { z } from 'zod'
import type { Queryable } from '../../../platform/db/client'
import { rowsOf } from '../../../platform/db/raw'
import { dayStart, localDay } from '../../../platform/db/time'
import { isLeafSql, pathRow, pathSql, TASK_COLUMNS } from './rows'
import { taskOpenSql, visibleTasks } from './scope'

const todayRow = pathRow.extend({ segment: todayTaskResponse.shape.segment })
export type TodayTask = z.output<typeof todayRow>

/**
 * Open LEAVES in unarchived projects that are in progress, planned up to today, or due before
 * tomorrow. Each falls in exactly one segment (overdue, then today, then in progress) so no row
 * shows twice; a plan from an earlier day stays until it is done. A parent never shows: its
 * status is its children's, and the child that is in progress is the row (FR-037). A parent's
 * deadline is its own (FR-043), but it is the calendar that shows it, not Today's list.
 */
export async function listToday(
  q: Queryable,
  workspaceId: WorkspaceId,
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
        ${TASK_COLUMNS},
        p.name as "projectName",
        p.rank as project_rank,
        parent.title as "parentTitle",
        ${pathSql('t')} as path,
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
      where ${visibleTasks(workspaceId, { task: 't', project: 'p' })}
        and p.archived_at is null
        and ${taskOpenSql('t')}
        and ${isLeafSql('t')}
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
      case when segment = 'overdue' then "dueAt" end asc,
      case when segment = 'today' then "dueAt" end asc nulls last,
      case when segment = 'in_progress' then "updatedAt" end desc,
      project_rank, rank, id
  `)
  return rowsOf(result, todayRow)
}
