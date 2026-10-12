import { rollup, type Rollup, type RollupNode, type RollupStatus } from '@ctws/core'
import { sql } from 'drizzle-orm'
import type { Queryable } from '../db/client'

/**
 * THE NUMBERS BEHIND “Movement”, for one project's whole tree.
 *
 * The split: this file asks the database for a flat list and nothing else, and `@ctws/core`'s
 * `rollup` folds it. The recursive mean is awkward in SQL and a dozen testable lines in TypeScript.
 *
 * What SQL DOES decide here is the two time-dependent flags, because deciding them anywhere else
 * would be a second notion of "what day is it". Every day boundary in this app is `at time zone
 * users.timezone`, and the overdue cut is the SAME expression `listToday` and `listMovement` use
 * -- if the three disagreed, the project banner, the Overdue panel and Today would report
 * different numbers for the same task.
 *
 * SCOPING, AND WHO SAYS 404. The query is tenant-scoped in its own `where` (`p.workspace_id`), so
 * another workspace's project yields no rows and nothing leaks. It does NOT distinguish "no such
 * project" from "a project with no tasks", and deliberately does not try: the route calls
 * `listProjectTasks` first, that function owns the visibility check, and a second copy of it here
 * was unreachable -- a mutation test proved it by breaking it and watching every test still pass.
 * A future caller that uses this alone has to establish visibility the same way.
 */

/** One row as the fold wants it, plus the task's own id for keying. */
type Row = {
  id: string
  parent_id: string | null
  status: RollupStatus
  manual_progress: string | null
  overdue: boolean
  due_soon: boolean
  last_activity_at: string | null
}

export async function projectRollups(
  q: Queryable,
  workspaceId: string,
  projectId: string,
  timezone: string,
  // Exists only so the day arithmetic can be tested at fixed instants, like `listToday`'s.
  now?: Date,
): Promise<Map<string, Rollup>> {
  const clock = now ? sql`${now.toISOString()}::timestamptz` : sql`now()`
  const dayStart = sql`(date_trunc('day', ${clock} at time zone ${timezone}) at time zone ${timezone})`
  const result = await q.execute(sql`
    with bounds as (
      select
        ${dayStart} as t0,
        -- THE NEAR WINDOW: the end of TOMORROW in the account's zone, not a rolling 48 hours. 48
        -- hours was the first shape of it; this is that span said in the vocabulary the rest of the
        -- app already speaks. A rolling window would make a deadline "soon" at 23:00 and not soon
        -- at 23:01 of the same evening, which a day-shaped interface cannot explain to the person
        -- reading it. Like every other day boundary here, the "+ 2 days" is added to the NAIVE
        -- local timestamp before converting back, so a DST day is 23 or 25 hours and nothing falls
        -- out of the window.
        ((date_trunc('day', ${clock} at time zone ${timezone}) + interval '2 days')
          at time zone ${timezone}) as soon_end
    )
    select
      t.id,
      t.parent_id,
      t.status,
      t.manual_progress,
      (
        t.due_at is not null
        and t.status not in ('done', 'cancelled')
        and t.due_at < b.t0
      ) as overdue,
      (
        t.due_at is not null
        and t.status not in ('done', 'cancelled')
        and t.due_at >= b.t0
        and t.due_at < b.soon_end
      ) as due_soon,
      -- Fixed-width UTC, the same shape the events endpoint emits: the fold takes a plain string
      -- maximum, which is the chronological maximum only while every value has this one shape.
      to_char(e.last_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as last_activity_at
    from tasks t
    join projects p on p.id = t.project_id
    join bounds b on true
    -- Indexed by (task_id, occurred_at desc), so each max is a single index probe.
    left join lateral (
      select max(ev.occurred_at) as last_at from task_events ev where ev.task_id = t.id
    ) e on true
    where p.id = ${projectId}
      and p.workspace_id = ${workspaceId}
      and p.deleted_at is null
      and t.deleted_at is null
  `)

  const rows = result.rows as Row[]
  const nodes: RollupNode[] = rows.map((r) => ({
    id: r.id,
    parentId: r.parent_id,
    status: r.status,
    // `numeric` arrives as a string from node-postgres, which would make every comparison and
    // every mean in the fold string arithmetic.
    manualProgress: r.manual_progress === null ? null : Number(r.manual_progress),
    overdue: r.overdue,
    dueSoon: r.due_soon,
    lastActivityAt: r.last_activity_at,
  }))
  return rollup(nodes)
}
