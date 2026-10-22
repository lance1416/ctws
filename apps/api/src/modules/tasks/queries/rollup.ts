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
import { dayStart } from '../../../platform/db/time'
import { taskOpenSql, visibleTasks } from './scope'

const rollupRow = z.object({
  id: taskId,
  parentId: taskId.nullable(),
  status: z.enum(TASK_STATUSES),
  overdue: z.boolean(),
})

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
      and ${visibleTasks(workspaceId, { task: 't', project: 'p' })}
  `)
  return rollup(rowsOf(result, rollupRow))
}

/**
 * The rollups of the given tasks, each over its own subtree: for parents shown outside their
 * project's tree, as on Today (FR-043). The same fold and day boundary as `projectRollups`.
 */
export async function subtreeRollups(
  q: Queryable,
  workspaceId: WorkspaceId,
  ids: readonly TaskId[],
  timezone: string,
  now: Date,
): Promise<Map<TaskId, Rollup>> {
  if (ids.length === 0) return new Map()
  const result = await q.execute(sql`
    with recursive sub as (
      select t.id, t.parent_id, t.status, t.due_at
      from tasks t
      join projects p on p.id = t.project_id
      where t.id in (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )})
        and ${visibleTasks(workspaceId, { task: 't', project: 'p' })}
      -- \`union\`, not \`union all\`: a parent under another one asked for is walked once.
      union
      select c.id, c.parent_id, c.status, c.due_at
      from tasks c
      join sub on c.parent_id = sub.id
      where c.deleted_at is null
    )
    select
      sub.id,
      sub.parent_id as "parentId",
      sub.status,
      (
        sub.due_at is not null
        and ${taskOpenSql('sub')}
        and sub.due_at < ${dayStart(now, timezone)}
      ) as overdue
    from sub
  `)
  return rollup(rowsOf(result, rollupRow))
}
