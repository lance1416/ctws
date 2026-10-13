import type { MoveTaskBody } from '@ctws/contracts'
import { rankBetween } from '@ctws/core'
import { and, asc, desc, eq, gt, isNull, lt, ne, sql } from 'drizzle-orm'
import type { Db, Queryable } from '../../platform/db/client'
import { projects } from '../../shell/projects/tables'
import { tasks } from './tables'
import { appendEvent } from './events'
import { ProjectNotFoundError } from '../../shell/projects/errors'
import { visibleProjects } from '../../shell/projects/queries'
import { DepthLimitError, InvalidNeighbourError, MoveCycleError } from './errors'
import { lockVisibleTask } from './queries/scope'
import type { Task } from './tables'
import { lockTaskTree, MAX_DEPTH } from './tree'
import { clearLeafProgress, depthOf, type TaskCtx } from './tasks'

type Descendant = { id: string; depth: number; live: boolean }

/**
 * Every row reachable downward from `rootId`, with its depth relative to `rootId` (the root
 * itself is 0) and whether it is live.
 *
 * ONE query feeds three checks whose readings of `deleted_at` deliberately differ. They look
 * like they could be collapsed into a single filter; they cannot:
 *
 *   - Cycle detection reads ALL rows, soft-deleted included. A cycle that runs through a
 *     soft-deleted row is just as fatal, because any query that does not filter `deleted_at`
 *     (the recursive step here, a future restore, a repair script) still recurses forever.
 *   - The depth/height check reads only LIVE rows. A soft-deleted descendant is invisible to the
 *     user, so letting it block an otherwise legal move would be an unexplainable refusal.
 *   - The `project_id` cascade writes ALL rows, soft-deleted included. `project_id` is an
 *     identity attribute, not a visibility one: a soft-deleted descendant left behind in the old
 *     project would be resurrected into the wrong project by a later restore.
 *
 * `union` (not `union all`) matches depthOf and softDeleteTask. Unlike there, dedup alone cannot
 * stop an already-corrupted cycle here, because the depth column keeps incrementing and so every
 * row stays distinct. Hence the extra `s.depth < MAX_DEPTH` bound on the recursive step.
 *
 * WHY THAT BOUND IS SAFE, which is a non-local argument worth writing down:
 *
 * The bound can truncate the traversal, and a truncated traversal could in principle miss a
 * descendant and so miss a cycle. What stops that is NOT the cycle check but the DEPTH CHECK
 * below. `depthOf` walks upward and is unbounded, so it reports the destination parent's true
 * depth; `parentDepth + liveHeight > MAX_DEPTH` therefore refuses, before any write, every move
 * whose destination sits deeper than MAX_DEPTH -- which is exactly the region the truncation
 * cannot see. The two checks are coupled: reordering them, relaxing the depth check, or adding a
 * second caller of `descendantsOf` that is not followed by a depth check reopens the gap. Note
 * that the refusal surfaces as DepthLimitError, not MoveCycleError; that is correct, since the depth
 * limit is the rule actually being broken.
 *
 * Do NOT turn the bound into an assertion on relative depth. A soft-deleted descendant may
 * legitimately sit past MAX_DEPTH: `liveHeight` counts only live rows (see above), so a chain of
 * ten whose bottom eight are soft-deleted has a live height of 2 and may legally be moved under a
 * depth-8 parent, leaving its deleted tail at absolute depth 11+. Asserting would then turn a
 * later, perfectly legal move of that same subtree into a false 409. A user-visible false refusal
 * is worse than a truncation the depth check already covers.
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
 * Moves a task: new parent, possibly a new project, and a rank derived from the neighbours the
 * client reports. One transaction for the whole thing (spec 8.3), because the cycle and depth
 * checks are read-then-write and a partial move is a corrupt tree.
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
    // Two concurrent moves (A under B, B under A) would each pass their own cycle check.
    await lockTaskTree(tx, ctx.workspaceId)

    const task = await lockVisibleTask(tx, ctx.workspaceId, id)

    const [project] = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, input.projectId), visibleProjects(ctx.workspaceId)))
    if (!project) throw new ProjectNotFoundError()

    // A soft-deleted parent is not a valid target: lockVisibleTask reports it as not found. Were
    // it allowed, the result would be a live task under a deleted parent -- the one state the two
    // guards in softDeleteTask cannot distinguish.
    //
    // With a parent, the parent's project wins over the client's `projectId`, exactly as in
    // createTask: spec 5.1 requires a child's project to equal its parent's, and making that
    // structurally impossible to violate beats validating it. The client's `projectId` is still
    // resolved and scoped above -- also exactly as in createTask -- so an unresolvable or foreign
    // id is a 404 on both paths rather than being silently ignored on one of them.
    const parent = input.parentId
      ? await lockVisibleTask(tx, ctx.workspaceId, input.parentId)
      : null
    const destProjectId = parent ? parent.projectId : project.id
    const destParentId = parent ? parent.id : null

    const subtree = await descendantsOf(tx, id)
    if (destParentId !== null && subtree.some((d) => d.id === destParentId))
      throw new MoveCycleError()

    // Depth of the destination parent (a root is 1, so a move to the project root gives 0) plus
    // the HEIGHT of the moved subtree -- the longest live path through it, not the number of rows
    // in it. Counting only the node itself would let a tall subtree be dropped just inside the
    // limit and push its leaves past it; counting rows would falsely refuse a bushy one.
    //
    // This check also closes the recursion-bound gap in descendantsOf; see the comment there
    // before reordering or relaxing it.
    const parentDepth = destParentId === null ? 0 : await depthOf(tx, destParentId)
    const liveHeight = Math.max(...subtree.filter((d) => d.live).map((d) => d.depth)) + 1
    if (parentDepth + liveHeight > MAX_DEPTH) throw new DepthLimitError()

    const rank = await rankFor(tx, { id, destProjectId, destParentId, input })

    const [updated] = await tx
      .update(tasks)
      .set({ parentId: destParentId, projectId: destProjectId, rank, updatedAt: sql`now()` })
      .where(eq(tasks.id, id))
      .returning()

    if (destProjectId !== task.projectId) {
      // The whole subtree, soft-deleted rows included (see descendantsOf). Done as one statement
      // rather than from the ids already in hand so the write is atomic with its own traversal.
      await tx.execute(sql`
        with recursive subtree(id) as (
          select ${id}::uuid
          union
          select t.id from tasks t join subtree s on t.parent_id = s.id
        )
        update tasks set project_id = ${destProjectId}, updated_at = now()
        where id in (select id from subtree) and project_id <> ${destProjectId}
      `)
      // The `project_id <>` above is an optimisation, NOT an invariant -- do not go looking for
      // the test that pins it. This statement only runs when the project actually changed, and
      // every row it skips already holds the destination id, so dropping it changes no final
      // state: only the number of rows written and their `updated_at` (including the moved row,
      // which was already updated above). Any test for it would have to assert a row count or an
      // `updated_at`, i.e. assert the optimisation rather than the behaviour.
    }

    // Spec 9.1: a pure rank change is NOT logged. A tidy-up of twenty drags must not read as
    // twenty pieces of progress in the weekly review, nor move the last_activity_at that stall
    // detection depends on. Only a changed parent or project is a real move.
    //
    // And only the moved row gets the event: the descendants whose project_id the cascade
    // rewrote were not themselves dragged, so one per descendant would be the same noise.
    const parentChanged = destParentId !== task.parentId
    const projectChanged = destProjectId !== task.projectId
    if (parentChanged || projectChanged) {
      await appendEvent(tx, {
        taskId: id,
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.actorUserId,
        type: 'moved',
        payload: {
          // Spec 9.2: only the changed fields' before and after. parentId is always present
          // because it identifies the position; projectId only when it actually changed.
          from: {
            parentId: task.parentId,
            ...(projectChanged ? { projectId: task.projectId } : {}),
          },
          to: {
            parentId: destParentId,
            ...(projectChanged ? { projectId: destProjectId } : {}),
          },
        },
      })
    }

    // The new parent has just stopped being a leaf, and manual progress is leaf-only (spec 5.2).
    // Same handling as createTask: clear it and say so in the log rather than rewriting history
    // silently. Without this, `move` would be a second way to break the invariant createTask
    // already defends.
    if (parent && parentChanged) await clearLeafProgress(tx, ctx, parent)

    return updated!
  })
}

/**
 * The rank for the destination slot. The client only names a neighbour; the rank itself is
 * computed here so the fractional-index implementation exists in exactly one place (spec 8.3),
 * and only the moved row is written -- never a bulk reorder of the siblings (spec 5.3).
 *
 * `beforeId` means "land ahead of this sibling", `afterId` "land behind it". Neither means
 * "append to the end". The moved task is excluded from the sibling set because it may already be
 * sitting in it.
 */
async function rankFor(
  tx: Queryable,
  args: {
    id: string
    destProjectId: string
    destParentId: string | null
    input: MoveTaskBody
  },
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

  // Strict comparison on rank, so a sibling that happens to share the neighbour's rank is
  // skipped: ranks are not unique (spec 5.3) and rankBetween requires before < after.
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
