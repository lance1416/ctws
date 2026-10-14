import type { MoveTaskBody } from '@ctws/contracts'
import { rankBetween } from '@ctws/core'
import { and, asc, desc, eq, gt, isNull, lt, ne, sql } from 'drizzle-orm'
import type { Db, Queryable } from '../../../platform/db/client'
import { visibleProjectId } from '../../../shell/projects/queries'
import { DepthLimitError, InvalidNeighbourError, MoveCycleError } from '../errors'
import { taskLog, type TaskCtx } from '../log'
import { lockVisibleTask } from '../queries/scope'
import { tasks, type Task } from '../tables'
import { clearLeafProgress, depthOf, lockTaskTree, MAX_DEPTH } from '../tree'

type Descendant = { id: string; depth: number; live: boolean }

/**
 * Every row under `rootId` (itself at depth 0) and whether it is live. The cycle check reads all
 * rows, the height check only live ones, and the project cascade writes all of them.
 *
 * The depth bound can cut the walk short, but only where the destination would sit more than
 * MAX_DEPTH below the moved task, which the depth check in `moveTask` always refuses; keep that
 * check after this one.
 */
async function descendantsOf(q: Queryable, rootId: string): Promise<Descendant[]> {
  const result = await q.execute(sql`
    with recursive subtree(id, depth, deleted_at) as (
      select id, 0, deleted_at from tasks where id = ${rootId}
      union
      select t.id, s.depth + 1, t.deleted_at
      from tasks t join subtree s on t.parent_id = s.id
      where s.depth < ${MAX_DEPTH}
    )
    select id, depth, (deleted_at is null) as live from subtree
  `)
  return result.rows as Descendant[]
}

/**
 * Moves a task to a new parent, possibly in another project, at the slot next to the neighbour
 * the client names. Under a parent the parent's project wins, as on create.
 */
export async function moveTask(
  db: Db,
  ctx: TaskCtx,
  id: string,
  input: MoveTaskBody,
): Promise<Task> {
  if (input.beforeId !== undefined && input.afterId !== undefined) {
    throw new InvalidNeighbourError('Give at most one of beforeId and afterId')
  }

  return db.transaction(async (tx) => {
    await lockTaskTree(tx, ctx.workspaceId)
    const log = taskLog(tx, ctx)
    const task = await lockVisibleTask(tx, ctx.workspaceId, id)
    const projectId = await visibleProjectId(tx, ctx.workspaceId, input.projectId)

    // A deleted parent reads as not found.
    const parent = input.parentId
      ? await lockVisibleTask(tx, ctx.workspaceId, input.parentId)
      : null
    const destProjectId = parent ? parent.projectId : projectId
    const destParentId = parent ? parent.id : null

    const subtree = await descendantsOf(tx, id)
    if (destParentId !== null && subtree.some((d) => d.id === destParentId))
      throw new MoveCycleError()

    // The parent's depth plus the moved subtree's live height, not its row count.
    const parentDepth = destParentId === null ? 0 : await depthOf(tx, destParentId)
    const liveHeight = Math.max(...subtree.filter((d) => d.live).map((d) => d.depth)) + 1
    if (parentDepth + liveHeight > MAX_DEPTH) throw new DepthLimitError()

    const rank = await rankFor(tx, { id, destProjectId, destParentId, input })

    const [updated] = await tx
      .update(tasks)
      .set({ parentId: destParentId, projectId: destProjectId, rank, updatedAt: sql`now()` })
      .where(eq(tasks.id, id))
      .returning()

    const parentChanged = destParentId !== task.parentId
    const projectChanged = destProjectId !== task.projectId

    if (projectChanged) {
      // Deleted rows too: a later restore must not bring one back into the old project.
      await tx.execute(sql`
        with recursive subtree(id) as (
          select ${id}::uuid
          union
          select t.id from tasks t join subtree s on t.parent_id = s.id
        )
        update tasks set project_id = ${destProjectId}, updated_at = now()
        where id in (select id from subtree) and project_id <> ${destProjectId}
      `)
    }

    // A pure reorder is not logged, so tidying up never reads as progress. The descendants the
    // cascade carried along get no event of their own.
    if (parentChanged || projectChanged) {
      await log.append(id, 'moved', {
        from: { parentId: task.parentId, ...(projectChanged ? { projectId: task.projectId } : {}) },
        to: { parentId: destParentId, ...(projectChanged ? { projectId: destProjectId } : {}) },
      })
    }

    if (parent && parentChanged) await clearLeafProgress(tx, log, parent)

    return updated!
  })
}

/**
 * The rank for the slot: `beforeId` lands ahead of that sibling, `afterId` behind it, neither at
 * the end. Only the moved row is written, never its siblings.
 */
async function rankFor(
  tx: Queryable,
  args: { id: string; destProjectId: string; destParentId: string | null; input: MoveTaskBody },
): Promise<string> {
  const { id, destProjectId, destParentId, input } = args
  const siblings = and(
    eq(tasks.projectId, destProjectId),
    destParentId === null ? isNull(tasks.parentId) : eq(tasks.parentId, destParentId),
    isNull(tasks.deletedAt),
    ne(tasks.id, id),
  )

  const neighbourId = input.beforeId ?? input.afterId
  if (neighbourId === undefined) {
    const [last] = await tx
      .select({ rank: tasks.rank })
      .from(tasks)
      .where(siblings)
      .orderBy(desc(tasks.rank), desc(tasks.id))
      .limit(1)
    return rankBetween(last?.rank ?? null, null)
  }

  const [neighbour] = await tx
    .select({ rank: tasks.rank })
    .from(tasks)
    .where(and(siblings, eq(tasks.id, neighbourId)))
  if (!neighbour) {
    throw new InvalidNeighbourError('The neighbour is not a live sibling at the destination')
  }

  // Strictly before or after: ranks are not unique, and rankBetween needs before < after.
  if (input.beforeId !== undefined) {
    const [prev] = await tx
      .select({ rank: tasks.rank })
      .from(tasks)
      .where(and(siblings, lt(tasks.rank, neighbour.rank)))
      .orderBy(desc(tasks.rank), desc(tasks.id))
      .limit(1)
    return rankBetween(prev?.rank ?? null, neighbour.rank)
  }

  const [next] = await tx
    .select({ rank: tasks.rank })
    .from(tasks)
    .where(and(siblings, gt(tasks.rank, neighbour.rank)))
    .orderBy(asc(tasks.rank), asc(tasks.id))
    .limit(1)
  return rankBetween(neighbour.rank, next?.rank ?? null)
}
