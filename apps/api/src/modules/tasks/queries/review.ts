import {
  calendarDate,
  projectId,
  REVIEW_TRANSITIONS,
  taskId,
  type ReviewList,
  type ReviewResponse,
  type WorkspaceId,
} from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Queryable } from '../../../platform/db/client'
import { rowsOf } from '../../../platform/db/raw'
import { scoped } from '../../../platform/db/scope'
import { sqlValues } from '../../../platform/db/sql'
import { events } from '../../../shell/events'
import { InvertedWindowError } from '../errors'
import { localNow } from '../../../platform/db/time'
import { visibleTasks } from './scope'

type ReviewProject = ReviewResponse['projects'][number]

type Recounted = (typeof REVIEW_TRANSITIONS)[ReviewList]

/** The list each recounted transition goes in. */
const LIST_FOR = Object.fromEntries(
  Object.entries(REVIEW_TRANSITIONS).map(([list, status]) => [status, list]),
) as Record<Recounted, ReviewList>

const RECOUNTED = Object.values(REVIEW_TRANSITIONS) as [Recounted, ...Recounted[]]

const reviewRow = z.object({
  project_id: projectId,
  project_name: z.string(),
  task_id: taskId,
  title: z.string(),
  to_status: z.enum(RECOUNTED),
  at: z.string(),
  /** A parent's change, worked out from its children rather than made (FR-043). */
  derived: z.boolean(),
  parent_id: taskId.nullable(),
  parent_title: z.string().nullable(),
})

const boundsRow = z.object({ from_day: calendarDate, to_day: calendarDate })

const stageMovedRow = z.object({
  task_id: taskId,
  title: z.string(),
  project_id: projectId,
  project_name: z.string(),
  to_stage: z.string(),
  at: z.string(),
})

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
      (${fromLocal})::date as from_day,
      (${toLocal})::date - 1 as to_day
  `)
  const edge = rowsOf(bounds, boundsRow)[0]!
  // The contract compares two given ends; an end left to default is only known here.
  if (edge.from_day > edge.to_day) throw new InvertedWindowError()

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
      to_char(ev.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as at,
      coalesce((ev.payload ->> 'derived')::boolean, false) as derived,
      t.parent_id,
      pt.title as parent_title
    from events ev
    join bounds b on true
    join tasks t on t.id = ev.object_id
    join projects p on p.id = t.project_id
    left join tasks pt on pt.id = t.parent_id
    where ${scoped(events, workspaceId, 'ev')}
      and ev.object_type = 'task'
      and ev.type = 'status_changed'
      and ev.payload ->> 'to' in (${sqlValues(RECOUNTED)})
      and ev.occurred_at >= b.t0
      and ev.occurred_at < b.t1
      and ${visibleTasks(workspaceId, { task: 't', project: 'p' })}
    order by p.rank, p.id, ev.occurred_at desc, ev.id desc
  `)

  const byProject = new Map<string, ReviewProject>()
  for (const r of rowsOf(result, reviewRow)) {
    let group = byProject.get(r.project_id)
    if (!group) {
      group = {
        projectId: r.project_id,
        projectName: r.project_name,
        finished: [],
        started: [],
        dropped: [],
        closedParents: [],
      }
      byProject.set(r.project_id, group)
    }
    const parent =
      r.parent_id && r.parent_title !== null ? { id: r.parent_id, title: r.parent_title } : null
    // A parent closing is a heading over what closed it, not one more thing finished.
    if (r.derived) {
      if (r.to_status === 'done' && !group.closedParents.some((e) => e.id === r.task_id))
        group.closedParents.push({ id: r.task_id, title: r.title, at: r.at, parent })
      continue
    }
    const list = group[LIST_FOR[r.to_status]]
    // Once per task per list; rows are newest first, so the latest is kept.
    if (!list.some((e) => e.id === r.task_id))
      list.push({ id: r.task_id, title: r.title, at: r.at, parent })
  }

  const stages = await q.execute(sql`
    with bounds as (
      select
        (${fromLocal} at time zone ${timezone}) as t0,
        (${toLocal} at time zone ${timezone}) as t1
    )
    select
      t.id as task_id, t.title, p.id as project_id, p.name as project_name,
      ev.payload ->> 'to' as to_stage,
      to_char(ev.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as at
    from events ev
    join bounds b on true
    join tasks t on t.id = ev.object_id
    join projects p on p.id = t.project_id
    where ${scoped(events, workspaceId, 'ev')}
      and ev.object_type = 'task'
      and ev.type = 'stage_changed'
      and ev.payload ->> 'to' is not null
      and ev.occurred_at >= b.t0
      and ev.occurred_at < b.t1
      and ${visibleTasks(workspaceId, { task: 't', project: 'p' })}
    order by ev.occurred_at desc, ev.id desc
  `)
  const stagesMoved = rowsOf(stages, stageMovedRow).map((r) => ({
    taskId: r.task_id,
    title: r.title,
    projectId: r.project_id,
    projectName: r.project_name,
    to: r.to_stage,
    at: r.at,
  }))

  return { from: edge.from_day, to: edge.to_day, projects: [...byProject.values()], stagesMoved }
}

const weekRow = z.object({ week: calendarDate, finished: z.coerce.number().int() })

/**
 * Every week from the one the workspace's first change is in, or last week if that is later, to
 * this one, newest first, each by
 * its Monday in the account's zone with how many leaves it finished: the review's list of weeks,
 * a week with nothing finished included. Counted as the review counts, once per task in its week.
 */
export async function listReviewWeeks(
  q: Queryable,
  workspaceId: WorkspaceId,
  timezone: string,
  now: Date,
): Promise<{ from: string; finished: number }[]> {
  const local = localNow(now, timezone)
  const result = await q.execute(sql`
    with first as (
      -- Last week at least: it is the one the review opens on.
      select least(
        date_trunc('week', min(ev.occurred_at at time zone ${timezone})),
        date_trunc('week', ${local}) - interval '1 week'
      ) as monday
      from events ev
      where ${scoped(events, workspaceId, 'ev')}
    ),
    weeks as (
      select generate_series(first.monday, date_trunc('week', ${local}), interval '1 week') as monday
      from first
    ),
    finished as (
      select date_trunc('week', ev.occurred_at at time zone ${timezone}) as monday, ev.object_id
      from events ev
      join tasks t on t.id = ev.object_id
      join projects p on p.id = t.project_id
      where ${scoped(events, workspaceId, 'ev')}
        and ev.object_type = 'task'
        and ev.type = 'status_changed'
        and ev.payload ->> 'to' = 'done'
        and not coalesce((ev.payload ->> 'derived')::boolean, false)
        and ${visibleTasks(workspaceId, { task: 't', project: 'p' })}
    )
    select w.monday::date as week, count(distinct f.object_id) as finished
    from weeks w
    left join finished f on f.monday = w.monday
    group by w.monday
    order by w.monday desc
  `)
  return rowsOf(result, weekRow).map((r) => ({ from: r.week, finished: r.finished }))
}
