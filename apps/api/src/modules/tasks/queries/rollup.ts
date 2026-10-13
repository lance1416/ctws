import { rollup, type Rollup, type RollupNode, type RollupStatus } from '@ctws/core'
import { sql } from 'drizzle-orm'
import type { Queryable } from '../../../platform/db/client'
import { dayStart } from '../../../platform/db/time'
import { taskVisibleSql } from './scope'

/** One task as `rollup` folds it. */
type Row = {
  id: string
  parent_id: string | null
  status: RollupStatus
  manual_progress: string | null
  overdue: boolean
  due_soon: boolean
  last_activity_at: string | null
}

/**
 * Each task's rollup across one project's tree. SQL decides the two day-dependent flags with the
 * same day boundaries Today uses; `rollup` does the fold. The caller checks the project first.
 */
export async function projectRollups(
  q: Queryable,
  workspaceId: string,
  projectId: string,
  timezone: string,
  now: Date,
): Promise<Map<string, Rollup>> {
  const result = await q.execute(sql`
    with bounds as (
      select
        ${dayStart(now, timezone)} as t0,
        -- Due soon ends with tomorrow in the account's zone, not a rolling 48 hours.
        ${dayStart(now, timezone, 2)} as soon_end
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
      -- Fixed-width UTC: the fold takes the string maximum.
      to_char(e.last_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as last_activity_at
    from tasks t
    join projects p on p.id = t.project_id
    join bounds b on true
    left join lateral (
      select max(ev.occurred_at) as last_at from task_events ev where ev.task_id = t.id
    ) e on true
    where p.id = ${projectId}
      and ${taskVisibleSql('t', 'p', workspaceId)}
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
