import {
  instant,
  projectId,
  taskId,
  UNTOUCHED_LISTED,
  UNTOUCHED_WEEKS,
  type WorkspaceId,
} from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Queryable } from '../../../platform/db/client'
import { rowsOf } from '../../../platform/db/raw'
import { scoped } from '../../../platform/db/scope'
import { instant as sqlInstant } from '../../../platform/db/time'
import { instantOf } from '../../../platform/zone'
import { addDays } from '@ctws/core'
import { events } from '../../../shell/events'
import { isLeafSql, TASK_COLUMNS, taskRow } from './rows'
import { visibleTasks } from './scope'

const pushedRow = z.object({
  id: taskId,
  title: z.string(),
  projectId,
  from: instant,
  to: instant,
})

/**
 * The review's "Pushed back": leaves whose deadline went later in the window, one row however
 * many times it moved, from the deadline before its first move there to the one after its last.
 * One moved back and forth and left no later than it was is not here. Only deadlines: a plan
 * slides every day and would bury the rest. `from` and `to` are the account's days, inclusive.
 */
export async function listPushed(
  q: Queryable,
  workspaceId: WorkspaceId,
  timezone: string,
  window: { from: string; to: string },
) {
  const t0 = instantOf(`${window.from}T00:00`, timezone)
  const t1 = instantOf(`${addDays(window.to, 1)}T00:00`, timezone)
  const result = await q.execute(sql`
    with moves as (
      select ev.object_id as id, ev.payload ->> 'from' as was, ev.payload ->> 'to' as now_due,
             ev.occurred_at, ev.id as event_id
      from events ev
      where ${scoped(events, workspaceId, 'ev')}
        and ev.object_type = 'task'
        and ev.type = 'due_changed'
        and ev.occurred_at >= ${sqlInstant(t0)}
        and ev.occurred_at < ${sqlInstant(t1)}
    ), spans as (
      select id,
        (array_agg(was order by occurred_at, event_id))[1] as first_was,
        (array_agg(now_due order by occurred_at desc, event_id desc))[1] as last_due
      from moves group by id
    )
    select t.id, t.title, t.project_id as "projectId",
      to_char(s.first_was::timestamptz at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "from",
      to_char(s.last_due::timestamptz at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "to"
    from spans s
    join tasks t on t.id = s.id
    join projects p on p.id = t.project_id
    where ${visibleTasks(workspaceId, { task: 't', project: 'p' })}
      and ${isLeafSql('t')}
      and s.first_was is not null and s.last_due is not null
      and s.last_due::timestamptz > s.first_was::timestamptz
    order by p.rank, p.id, t.rank, t.id
  `)
  return rowsOf(result, pushedRow)
}

const untouchedRow = taskRow.extend({ total: z.coerce.number().int() })

/**
 * The review's "Untouched": backlog leaves in live projects with nothing in their log for eight
 * weeks (or made that long ago with nothing since), and not kept in that time. The longest
 * untouched first, the first few listed and the rest counted: dropping one stays a decision.
 */
export async function listUntouched(q: Queryable, workspaceId: WorkspaceId, now: Date) {
  const since = new Date(now.getTime() - UNTOUCHED_WEEKS * 7 * 86_400_000)
  const result = await q.execute(sql`
    select ${TASK_COLUMNS}, p.name as "projectName", null as "parentTitle",
      count(*) over () as total
    from tasks t
    join projects p on p.id = t.project_id
    cross join lateral (
      select coalesce(max(ev.occurred_at), t.created_at) as last_at
      from events ev where ev.object_type = 'task' and ev.object_id = t.id
    ) touched
    where ${visibleTasks(workspaceId, { task: 't', project: 'p' })}
      and p.archived_at is null
      and t.status = 'backlog'
      and ${isLeafSql('t')}
      and touched.last_at < ${sqlInstant(since)}
      and (t.kept_at is null or t.kept_at < ${sqlInstant(since)})
    order by touched.last_at, t.id
    limit ${UNTOUCHED_LISTED}
  `)
  const rows = rowsOf(result, untouchedRow)
  return { rows, total: rows[0]?.total ?? 0 }
}

/**
 * Wrapping up a day: open leaves planned for it that nothing was done to that day, by its log in
 * the account's zone. A count on the page, and each one's day changed from there.
 */
export async function listUntouchedPlan(
  q: Queryable,
  workspaceId: WorkspaceId,
  timezone: string,
  day: string,
) {
  const t0 = instantOf(`${day}T00:00`, timezone)
  const t1 = instantOf(`${addDays(day, 1)}T00:00`, timezone)
  const result = await q.execute(sql`
    select ${TASK_COLUMNS}, p.name as "projectName", null as "parentTitle"
    from tasks t
    join projects p on p.id = t.project_id
    where ${visibleTasks(workspaceId, { task: 't', project: 'p' })}
      and t.scheduled_on = ${day}::date
      and t.status not in ('done', 'cancelled')
      and ${isLeafSql('t')}
      and not exists (
        select 1 from events ev
        where ev.object_type = 'task' and ev.object_id = t.id
          and ev.occurred_at >= ${sqlInstant(t0)} and ev.occurred_at < ${sqlInstant(t1)}
      )
    order by p.rank, p.id, t.rank, t.id
  `)
  return rowsOf(result, taskRow)
}
