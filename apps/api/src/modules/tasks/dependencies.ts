import { and, eq, sql } from 'drizzle-orm'
import type { Queryable } from '../../platform/db/client'
import { taskDependencies } from './tables'
import { DependencyCycleError } from './errors'
import { visibleTask } from './queries/scope'
import { appendEvent } from './events'
import type { TaskCtx } from './tasks'

/**
 * WHAT HAS TO HAPPEN FIRST.
 *
 * The edge is stored; "blocked" is not. A task is blocked while any of its blockers is
 * unfinished, which means finishing the blocker unblocks it with no second write and the two can
 * never disagree. Everything below is about keeping the EDGES honest -- the derived half is a
 * read, and it lives in the list queries.
 */

/**
 * Would `blocker -> blocked` close a loop?
 *
 * It would exactly when `blocked` is ALREADY a transitive blocker of `blocker` -- walk up from
 * `blocker` through "what is this waiting for" and see whether `blocked` turns up.
 *
 * `union`, NOT `union all`. The graph is a DAG by induction (every edge that would have closed a
 * loop was refused), so the walk terminates either way; what `union all` would do is re-walk a
 * node once per path reaching it, which on a diamond is exponential. The same lesson is written
 * on `move`'s traversal, which learned it the hard way.
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
 * Records that `blockedId` waits for `blockerId`.
 *
 * Idempotent: asking twice is not an error, because the second ask describes the same world as
 * the first. It is also what a double-click produces.
 */
export async function addDependency(
  q: Queryable,
  ctx: TaskCtx,
  blockedId: string,
  blockerId: string,
): Promise<void> {
  if (blockedId === blockerId) throw new DependencyCycleError()
  // Both ends are checked, and both against THIS workspace: an id from somewhere else must read
  // as "no such task", never as a refusal that confirms it exists.
  await visibleTask(q, ctx.workspaceId, blockedId)
  await visibleTask(q, ctx.workspaceId, blockerId)
  if (await wouldCycle(q, ctx.workspaceId, blockerId, blockedId)) throw new DependencyCycleError()

  await q
    .insert(taskDependencies)
    .values({ blockerId, blockedId, workspaceId: ctx.workspaceId })
    .onConflictDoNothing()
  await appendEvent(q, {
    taskId: blockedId,
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.actorUserId,
    type: 'dependency_added',
    payload: { blockerId },
  })
}

/** Forgets that `blockedId` waits for `blockerId`. Also idempotent. */
export async function removeDependency(
  q: Queryable,
  ctx: TaskCtx,
  blockedId: string,
  blockerId: string,
): Promise<void> {
  const removed = await q
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
  await appendEvent(q, {
    taskId: blockedId,
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.actorUserId,
    type: 'dependency_removed',
    payload: { blockerId },
  })
}
