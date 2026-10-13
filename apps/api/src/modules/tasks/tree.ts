import { eq, sql } from 'drizzle-orm'
import type { Queryable } from '../../platform/db/client'
import { LOCKS, lockFor } from '../../platform/db/locks'
import type { TaskLog } from './log'
import { tasks } from './tables'

/** The deepest a task may sit; a root is at depth 1. */
export const MAX_DEPTH = 10

/**
 * Serialises changes to the shape of one workspace's tasks: create, move, delete and new
 * dependencies. Take it as the transaction's first statement: the cascades and the loop checks
 * read from their own snapshot, so a row written after that snapshot is never visited.
 */
export const lockTaskTree = (tx: Queryable, workspaceId: string): Promise<void> =>
  lockFor(tx, LOCKS.taskTree, workspaceId)

/**
 * Tasks on the path from `taskId` up to its root, itself included. Walks upward, so it costs at
 * most MAX_DEPTH steps; deleted ancestors still count.
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

/** Manual progress is leaf-only, so a task that gains a child loses it, and the log says so. */
export async function clearLeafProgress(
  tx: Queryable,
  log: TaskLog,
  parent: { id: string; manualProgress: string | null },
): Promise<void> {
  if (parent.manualProgress === null) return
  await tx
    .update(tasks)
    .set({ manualProgress: null, updatedAt: sql`now()` })
    .where(eq(tasks.id, parent.id))
  await log.append(parent.id, 'progress_set', { from: Number(parent.manualProgress), to: null })
}
