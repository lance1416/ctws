import { and, eq, sql } from 'drizzle-orm'
import type { Db, Queryable } from '../../../platform/db/client'
import { DependencyCycleError } from '../errors'
import { taskLog, type TaskCtx } from '../log'
import { visibleTask } from '../queries/scope'
import { taskDependencies } from '../tables'
import { lockTaskTree } from '../tree'

/**
 * Would `blocker -> blocked` close a loop, i.e. is `blocked` already upstream of `blocker`?
 * `union` keeps a diamond from being walked once per path.
 */
async function wouldCycle(
  q: Queryable,
  workspaceId: string,
  blockerId: string,
  blockedId: string,
): Promise<boolean> {
  const rows = await q.execute(sql`
    with recursive upstream(id) as (
      select ${blockerId}::uuid
      union
      select d.blocker_id
      from task_dependencies d
      join upstream u on u.id = d.blocked_id
      where d.workspace_id = ${workspaceId}
    )
    select 1 from upstream where id = ${blockedId}::uuid
  `)
  return rows.rows.length > 0
}

/**
 * Records that `blockedId` waits for `blockerId`; "blocked" itself is derived when read. Asking
 * twice is not an error and logs once.
 */
export async function addDependency(
  db: Db,
  ctx: TaskCtx,
  blockedId: string,
  blockerId: string,
): Promise<void> {
  if (blockedId === blockerId) throw new DependencyCycleError()
  await db.transaction(async (tx) => {
    // The loop check is read-then-write: two opposite adds must not both pass it.
    await lockTaskTree(tx, ctx.workspaceId)
    // A foreign id reads as not found, never as a refusal that confirms it exists.
    await visibleTask(tx, ctx.workspaceId, blockedId)
    await visibleTask(tx, ctx.workspaceId, blockerId)
    if (await wouldCycle(tx, ctx.workspaceId, blockerId, blockedId))
      throw new DependencyCycleError()

    const added = await tx
      .insert(taskDependencies)
      .values({ blockerId, blockedId, workspaceId: ctx.workspaceId })
      .onConflictDoNothing()
      .returning({ blockerId: taskDependencies.blockerId })
    if (added.length === 0) return
    await taskLog(tx, ctx).append(blockedId, 'dependency_added', { blockerId })
  })
}

/** Forgets that `blockedId` waits for `blockerId`. Also idempotent. */
export async function removeDependency(
  db: Db,
  ctx: TaskCtx,
  blockedId: string,
  blockerId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const removed = await tx
      .delete(taskDependencies)
      .where(
        and(
          eq(taskDependencies.blockedId, blockedId),
          eq(taskDependencies.blockerId, blockerId),
          eq(taskDependencies.workspaceId, ctx.workspaceId),
        ),
      )
      .returning({ blockerId: taskDependencies.blockerId })
    if (removed.length === 0) return
    await taskLog(tx, ctx).append(blockedId, 'dependency_removed', { blockerId })
  })
}
