import { sql } from 'drizzle-orm'
import type { Queryable } from '../../platform/db/client'
import { LOCKS, lockFor } from '../../platform/db/locks'

/**
 * Serialises changes to the shape of one workspace's tasks: create, move, delete and new
 * dependencies. Take it as the transaction's first statement: the cascades and the loop checks
 * read from their own snapshot, so a row written after that snapshot is never visited.
 */
export const lockTaskTree = (tx: Queryable, workspaceId: string): Promise<void> =>
  lockFor(tx, LOCKS.taskTree, workspaceId)

/**
 * Tasks on the path from `taskId` up to its root, itself included. Walks upward, so it costs at
 * most MAX_TASK_DEPTH steps; deleted ancestors still count.
 */
export async function depthOf(q: Queryable, taskId: string): Promise<number> {
  const result = await q.execute(sql`
    with recursive ancestors(id, parent_id) as (
      select id, parent_id from tasks where id = ${taskId}
      union
      select t.id, t.parent_id from tasks t join ancestors a on t.id = a.parent_id
    )
    select count(*)::int as depth from ancestors
  `)
  return (result.rows[0] as { depth: number }).depth
}
