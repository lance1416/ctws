import { sql } from 'drizzle-orm'
import type { Queryable } from '../db/client'

/**
 * THE WEEKLY REVIEW (design spec §8, §9.3). The view that answers 「我做了什么」.
 *
 * IT READS THE EVENT LOG, NOT THE TASKS. That is the whole difference between this and 已完成.
 * 已完成 lists what is finished RIGHT NOW; this lists what HAPPENED in a window. A task finished
 * on Tuesday and reopened on Thursday is absent from the first and present in both halves of the
 * second, which is the honest account of the week -- and the dishonest version is exactly the one
 * that makes a review not worth opening.
 *
 * THREE TRANSITIONS, not every event. “Done”, “Start” and “Dropped” are the ones a person recounts
 * about a week. A title edit and a reparent are in the log and are deliberately not here: a
 * review that lists every keystroke is a diff, not a review. (§9.3 already keeps pure reordering
 * out of the log entirely, for the same reason.)
 */

export type ReviewTask = {
  id: string
  title: string
  /** When the transition happened, UTC ISO. */
  at: string
}

export type ReviewProject = {
  projectId: string
  projectName: string
  finished: ReviewTask[]
  started: ReviewTask[]
  dropped: ReviewTask[]
}

export type ReviewWindow = {
  /** The window's own bounds as calendar days in the account's zone, for the heading. */
  from: string
  to: string
  projects: ReviewProject[]
}

type Row = {
  project_id: string
  project_name: string
  task_id: string
  title: string
  to_status: string
  at: string
}

/**
 * `from` and `to` are CALENDAR DAYS in the account's zone, inclusive at both ends. Omitted, the
 * window is the current week -- Monday to today -- decided in that zone by the database, the way
 * every other boundary in this app is.
 */
export async function listReview(
  q: Queryable,
  workspaceId: string,
  timezone: string,
  range?: { from?: string | undefined; to?: string | undefined },
  // Exists only so the week boundary can be tested at fixed instants.
  now?: Date,
): Promise<ReviewWindow> {
  const clock = now ? sql`${now.toISOString()}::timestamptz` : sql`now()`
  const localNow = sql`(${clock} at time zone ${timezone})`
  // Monday 00:00 of the current week, as a LOCAL timestamp; converted back at the end, like
  // `listMovement`'s. The named days arrive as days and become the same kind of local timestamp,
  // so one expression covers both cases.
  const fromLocal = range?.from
    ? sql`${range.from}::date::timestamp`
    : sql`date_trunc('week', ${localNow})`
  // Inclusive at the far end: the window ends at the START of the day after `to`.
  const toLocal = range?.to
    ? sql`(${range.to}::date + 1)::timestamp`
    : sql`(date_trunc('day', ${localNow}) + interval '1 day')`

  // The window's own edges, asked for separately because they have to be reportable even when
  // nothing happened inside it -- a week with no events still has a heading.
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
    where ev.workspace_id = ${workspaceId}
      and ev.type = 'status_changed'
      and ev.payload ->> 'to' in ('done', 'in_progress', 'cancelled')
      and ev.occurred_at >= b.t0
      and ev.occurred_at < b.t1
      -- A deleted task's history stays in the log (§5.4) but does not belong in a recount of the
      -- week; the same is true of a project that has been deleted out from under it.
      and t.deleted_at is null
      and p.deleted_at is null
    order by p.rank, p.id, ev.occurred_at desc, ev.id
  `)

  const rows = result.rows as Row[]

  const byProject = new Map<string, ReviewProject>()
  for (const r of rows) {
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
    const entry = { id: r.task_id, title: r.title, at: r.at }
    const list =
      r.to_status === 'done'
        ? group.finished
        : r.to_status === 'in_progress'
          ? group.started
          : group.dropped
    // ONE ENTRY PER TASK PER LIST. Starting something twice in a week is one thing started, and
    // the rows are newest-first, so the one kept is the most recent.
    if (!list.some((e) => e.id === entry.id)) list.push(entry)
  }

  return { from: edge.from_day, to: edge.to_day, projects: [...byProject.values()] }
}
