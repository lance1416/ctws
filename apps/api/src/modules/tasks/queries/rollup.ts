import {
  TASK_STATUSES,
  taskId,
  type ProjectId,
  type TaskId,
  type WorkspaceId,
} from '@ctws/contracts'
import { rollup, type Rollup } from '@ctws/core'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Queryable } from '../../../platform/db/client'
import { rowsOf } from '../../../platform/db/raw'
import { dayStart, localDay } from '../../../platform/db/time'
import { overdueSql, visibleTasks } from './scope'

const rollupRow = z.object({
  id: taskId,
  parentId: taskId.nullable(),
  status: z.enum(TASK_STATUSES),
  overdue: z.boolean(),
})

/**
 * Each task's rollup across one project's tree. SQL decides `overdue` by the rule Today's Overdue
 * uses; `rollup` does the fold. The caller checks the project first.
 */
export async function projectRollups(
  q: Queryable,
  workspaceId: WorkspaceId,
  projectId: ProjectId,
  timezone: string,
  now: Date,
): Promise<Map<TaskId, Rollup>> {
  const result = await q.execute(sql`
    select
      t.id,
      t.parent_id as "parentId",
      t.status,
      ${overdueSql('t', { dayStarts: dayStart(now, timezone), today: localDay(now, timezone) })}
        as overdue
    from tasks t
    join projects p on p.id = t.project_id
    where p.id = ${projectId}
      and ${visibleTasks(workspaceId, { task: 't', project: 'p' })}
  `)
  return rollup(rowsOf(result, rollupRow))
}
