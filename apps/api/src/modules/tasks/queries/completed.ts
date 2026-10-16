import type { WorkspaceId } from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import type { Queryable } from '../../../platform/db/client'
import { TASK_COLUMNS, taskRowOf, type TaskRow } from './rows'
import { taskVisibleSql } from './scope'

export type CompletedTask = TaskRow & {
  completedAt: Date
  /** The day it was finished, in the account's zone. */
  completedOn: string
}

/** How many finished tasks the list shows; the weekly review covers older ones. */
const COMPLETED_LIMIT = 200

/**
 * Finished tasks, newest first, archived projects included. One extra row is read so the answer
 * can say whether the list was cut short.
 */
export async function listCompleted(
  q: Queryable,
  workspaceId: WorkspaceId,
  timezone: string,
): Promise<{ tasks: CompletedTask[]; truncated: boolean }> {
  const result = await q.execute(sql`
    select
      ${TASK_COLUMNS('t')},
      p.name as project_name,
      parent.title as parent_title,
      ((t.completed_at at time zone ${timezone})::date)::text as completed_on
    from tasks t
    join projects p on p.id = t.project_id
    left join tasks parent on parent.id = t.parent_id
    where ${taskVisibleSql('t', 'p', workspaceId)}
      and t.status = 'done'
      and t.completed_at is not null
    order by t.completed_at desc, t.id
    limit ${COMPLETED_LIMIT + 1}
  `)
  const rows = result.rows as Record<string, unknown>[]
  return {
    tasks: rows.slice(0, COMPLETED_LIMIT).map((r) => ({
      ...taskRowOf(r),
      completedAt: new Date(r.completed_at as string),
      completedOn: r.completed_on as string,
    })),
    truncated: rows.length > COMPLETED_LIMIT,
  }
}
