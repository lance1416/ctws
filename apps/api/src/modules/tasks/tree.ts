import { TASK_STATUSES, type TaskId, type TaskStatus, type WorkspaceId } from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Queryable, Tx } from '../../platform/db/client'
import { rowsOf } from '../../platform/db/raw'
import { lockFor } from '../../platform/db/locks'

/** The task tree's advisory lock, in the platform's key series. */
const TREE_LOCK = 7_301_003

/**
 * Serialises changes to the shape of one workspace's tasks: create, move, delete and new
 * dependencies. Take it as the transaction's first statement: the cascades and the loop checks
 * read from their own snapshot, so a row written after that snapshot is never visited.
 */
export const lockTaskTree = (tx: Tx, workspaceId: WorkspaceId): Promise<void> =>
  lockFor(tx, TREE_LOCK, workspaceId)

const statusRow = z.object({ status: z.enum(TASK_STATUSES) })

/** The statuses of a task's live children, in no order; empty for a leaf. */
export async function childStatuses(q: Queryable, taskId: TaskId): Promise<TaskStatus[]> {
  const result = await q.execute(sql`
    select status from tasks where parent_id = ${taskId} and deleted_at is null
  `)
  return rowsOf(result, statusRow).map((r) => r.status)
}

/**
 * Tasks on the path from `taskId` up to its root, itself included. Walks upward, so it costs at
 * most MAX_TASK_DEPTH steps; deleted ancestors still count.
 */
export async function depthOf(q: Queryable, taskId: TaskId): Promise<number> {
  const result = await q.execute(sql`
    with recursive ancestors(id, parent_id) as (
      select id, parent_id from tasks where id = ${taskId}
      union
      select t.id, t.parent_id from tasks t join ancestors a on t.id = a.parent_id
    )
    select count(*)::int as depth from ancestors
  `)
  return rowsOf(result, z.object({ depth: z.number() }))[0]!.depth
}
