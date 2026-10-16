import { calendarDate, type WorkspaceId } from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Queryable } from '../../../platform/db/client'
import { rowsOf } from '../../../platform/db/raw'
import { TASK_COLUMNS, taskRow } from './rows'
import { visibleTasks } from './scope'

const completedRow = taskRow.extend({
  /** Read as every task column is, and never null here: the query keeps finished tasks only. */
  completedAt: taskRow.shape.completedAt.pipe(z.date()),
  /** The day it was finished, in the account's zone. */
  completedOn: calendarDate,
})
export type CompletedTask = z.output<typeof completedRow>

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
      ${TASK_COLUMNS},
      p.name as "projectName",
      parent.title as "parentTitle",
      (t.completed_at at time zone ${timezone})::date as "completedOn"
    from tasks t
    join projects p on p.id = t.project_id
    left join tasks parent on parent.id = t.parent_id
    where ${visibleTasks(workspaceId, { task: 't', project: 'p' })}
      and t.status = 'done'
      and t.completed_at is not null
    order by t.completed_at desc, t.id
    limit ${COMPLETED_LIMIT + 1}
  `)
  const rows = rowsOf(result, completedRow)
  return { tasks: rows.slice(0, COMPLETED_LIMIT), truncated: rows.length > COMPLETED_LIMIT }
}
