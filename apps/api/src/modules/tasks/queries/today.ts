import { todayTaskResponse, type WorkspaceId } from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import type { z } from 'zod'
import type { Queryable } from '../../../platform/db/client'
import { rowsOf } from '../../../platform/db/raw'
import { dayStart, localDay } from '../../../platform/db/time'
import { pathRow, pathSql, TASK_COLUMNS } from './rows'
import { overdueSql, taskOpenSql, visibleTasks } from './scope'

const todayRow = pathRow.extend({
  segment: todayTaskResponse.shape.segment,
  children: todayTaskResponse.shape.children,
})
export type TodayTask = z.output<typeof todayRow>

/**
 * Open LEAVES in unarchived projects that are in progress, planned up to today, or due before
 * tomorrow, except a late one planned for a later day, which waits for that day. Each falls in
 * exactly one segment so no row shows twice: overdue wins, then in progress (what is being done
 * stays there, due today or not, FR-079), then today's plans and deadlines. A plan from an earlier
 * day stays until it is done; a late one is overdue again instead (`overdueSql`).
 *
 * A parent shows only by its own deadline (FR-043): due today it is a row of today's, missed it is
 * overdue, and it carries its children's counts. Never in progress: its status is its children's,
 * and the child that is in progress is that row (FR-037).
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
        kids.total > 0 as is_parent,
        case
          when ${overdueSql('t', { dayStarts: sql`b.t0`, today: sql`b.today` })} then 'overdue'
          when t.status = 'in_progress' and kids.total = 0 then 'in_progress'
          else 'today'
        end as segment
      from tasks t
      join projects p on p.id = t.project_id
      join bounds b on true
      left join tasks parent on parent.id = t.parent_id
      cross join lateral (
        select count(*) as total from tasks c where c.parent_id = t.id and c.deleted_at is null
      ) kids
      where ${visibleTasks(workspaceId, { task: 't', project: 'p' })}
        and p.archived_at is null
        and ${taskOpenSql('t')}
        and (
          (
            t.due_at is not null
            and t.due_at < b.t1
            and not (t.due_at < b.t0 and t.scheduled_on is not null and t.scheduled_on > b.today)
          )
          or (
            kids.total = 0
            and (
              (t.scheduled_on is not null and t.scheduled_on <= b.today)
              or t.status = 'in_progress'
            )
          )
        )
    )
    -- A parent's leaves, walked only for the parents picked: done, counted (neither in the backlog
    -- nor cancelled) and in the backlog, the one measure its square and its "1/4" share (FR-051).
    select
      picked.*,
      case when picked.is_parent then (
        with recursive under as (
          select c.id, c.status from tasks c where c.parent_id = picked.id and c.deleted_at is null
          union all
          select g.id, g.status from tasks g join under on g.parent_id = under.id
          where g.deleted_at is null
        )
        select json_build_object(
          'done', count(*) filter (where under.status = 'done'),
          'counted', count(*) filter (where under.status not in ('backlog', 'cancelled')),
          'backlog', count(*) filter (where under.status = 'backlog')
        )
        from under
        where not exists (
          select 1 from tasks k where k.parent_id = under.id and k.deleted_at is null
        )
      ) end as children
    from picked
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
