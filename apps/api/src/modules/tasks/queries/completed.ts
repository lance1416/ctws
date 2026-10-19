import { calendarDate, type WorkspaceId } from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Queryable } from '../../../platform/db/client'
import { rowsOf } from '../../../platform/db/raw'
import { isLeafSql, TASK_COLUMNS, taskRow } from './rows'
import { visibleTasks } from './scope'
import { type Page, type PageAsked, pageOf, spanOf } from '../../../platform/db/page'

const completedRow = taskRow.extend({
  /** Read as every task column is, and never null here: the query keeps finished tasks only. */
  completedAt: taskRow.shape.completedAt.pipe(z.date()),
  /** The day it was finished, in the account's zone. */
  completedOn: calendarDate,
})
export type CompletedTask = z.output<typeof completedRow>

/** Finished tasks, newest first, archived projects included, a page at a time. */
export async function listCompleted(
  q: Queryable,
  workspaceId: WorkspaceId,
  timezone: string,
  asked: PageAsked,
): Promise<Page<CompletedTask>> {
  const span = spanOf(asked)
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
      -- A parent is done because its children are: they are the things finished (FR-043).
      and ${isLeafSql('t')}
    order by t.completed_at desc, t.id
    limit ${span.limit} offset ${span.offset}
  `)
  return pageOf(rowsOf(result, completedRow), asked)
}
