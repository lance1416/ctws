import {
  REVIEW_TRANSITIONS,
  type ReviewList,
  type ReviewResponse,
  type ProjectId,
  type TaskId,
  type WorkspaceId,
} from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import type { Queryable } from '../../../platform/db/client'
import { scoped } from '../../../platform/db/scope'
import { sqlValues } from '../../../platform/db/sql'
import { taskEvents } from '../tables'
import { localNow } from '../../../platform/db/time'
import { visibleTasks } from './scope'

type ReviewProject = ReviewResponse['projects'][number]

type Recounted = (typeof REVIEW_TRANSITIONS)[ReviewList]

/** The list each recounted transition goes in. */
const LIST_FOR = Object.fromEntries(
  Object.entries(REVIEW_TRANSITIONS).map(([list, status]) => [status, list]),
) as Record<Recounted, ReviewList>

type Row = {
  project_id: ProjectId
  project_name: string
  task_id: TaskId
  title: string
  to_status: Recounted
  at: string
}

/**
 * What changed state in a window, read from the event log rather than current status, grouped by
 * project. `from` and `to` are days in the account's zone, inclusive; the default is this week to
 * today.
 */
export async function listReview(
  q: Queryable,
  workspaceId: WorkspaceId,
  timezone: string,
  range: { from?: string | undefined; to?: string | undefined },
  now: Date,
): Promise<ReviewResponse> {
  const local = localNow(now, timezone)
  // Both ends as naive local timestamps, converted to instants below; `to` is inclusive.
  const fromLocal = range.from
    ? sql`${range.from}::date::timestamp`
    : sql`date_trunc('week', ${local})`
  const toLocal = range.to
    ? sql`(${range.to}::date + 1)::timestamp`
    : sql`(date_trunc('day', ${local}) + interval '1 day')`

  // Asked separately: a week with nothing in it still has a heading.
  const bounds = await q.execute(sql`
    select
      (${fromLocal})::date::text as from_day,
      ((${toLocal})::date - 1)::text as to_day
  `)
  const edge = bounds.rows[0] as { from_day: string; to_day: string }

  const result = await q.execute(sql`
    with bounds as (
      select
        (${fromLocal} at time zone ${timezone}) as t0,
        (${toLocal} at time zone ${timezone}) as t1
    )
    select
      p.id as project_id,
      p.name as project_name,
      t.id as task_id,
      t.title,
      ev.payload ->> 'to' as to_status,
      to_char(ev.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as at
    from task_events ev
    join bounds b on true
    join tasks t on t.id = ev.task_id
    join projects p on p.id = t.project_id
    where ${scoped(taskEvents, workspaceId, 'ev')}
      and ev.type = 'status_changed'
      and ev.payload ->> 'to' in (${sqlValues(Object.values(REVIEW_TRANSITIONS))})
      and ev.occurred_at >= b.t0
      and ev.occurred_at < b.t1
      and ${visibleTasks(workspaceId, { task: 't', project: 'p' })}
    order by p.rank, p.id, ev.occurred_at desc, ev.id
  `)

  const byProject = new Map<string, ReviewProject>()
  for (const r of result.rows as Row[]) {
    let group = byProject.get(r.project_id)
    if (!group) {
      group = {
        projectId: r.project_id,
        projectName: r.project_name,
        finished: [],
        started: [],
        dropped: [],
      }
      byProject.set(r.project_id, group)
    }
    const list = group[LIST_FOR[r.to_status]]
    // Once per task per list; rows are newest first, so the latest is kept.
    if (!list.some((e) => e.id === r.task_id))
      list.push({ id: r.task_id, title: r.title, at: r.at })
  }

  return { from: edge.from_day, to: edge.to_day, projects: [...byProject.values()] }
}
