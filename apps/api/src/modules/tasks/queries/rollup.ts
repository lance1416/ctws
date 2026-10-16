import type { ProjectId, TaskId, WorkspaceId } from '@ctws/contracts'
import { rollup, type Rollup, type RollupNode } from '@ctws/core'
import { sql } from 'drizzle-orm'
import type { Queryable } from '../../../platform/db/client'
import { dayStart } from '../../../platform/db/time'
import { taskOpenSql, taskVisibleSql } from './scope'

/**
 * Each task's rollup across one project's tree. SQL decides `overdue` with the same day boundary
 * Today uses; `rollup` does the fold. The caller checks the project first.
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
      (
        t.due_at is not null
        and ${taskOpenSql('t')}
        and t.due_at < ${dayStart(now, timezone)}
      ) as overdue
    from tasks t
    join projects p on p.id = t.project_id
    where p.id = ${projectId}
      and ${taskVisibleSql('t', 'p', workspaceId)}
  `)
  return rollup(result.rows as RollupNode<TaskId>[])
}
