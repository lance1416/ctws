import {
  type CreateTaskBody,
  MAX_TASK_DEPTH,
  type ProjectId,
  type TaskEventType,
  taskId,
  type TaskId,
  type TaskPosition,
  type UpdateTaskBody,
  type WorkspaceId,
} from '@ctws/contracts'
import { derivedStatus, rankBetween } from '@ctws/core'
import { and, asc, desc, eq, gt, isNull, lt, ne, sql } from 'drizzle-orm'
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core'
import { z } from 'zod'
import type { Db, Queryable, Tx } from '../../platform/db/client'
import { newId } from '../../platform/db/ids'
import { rowsOf } from '../../platform/db/raw'
import { type Actor, scoped, within } from '../../platform/db/scope'
import { instant } from '../../platform/db/time'
import { isoOrNull } from '../../platform/values'
import { getProject, getStage } from '../../shell/projects'
import { syncMentions } from '../../shell/relations'
import {
  BothNeighboursError,
  DependencyCycleError,
  DepthLimitError,
  DerivedFieldError,
  InvalidNeighbourError,
  MoveCycleError,
} from './errors'
import { taskLog } from './log'
import { getTask, lockTask, visibleTasks } from './queries'
import { type Task, taskDependencies, tasks } from './tables'
import { childStatuses, depthOf, lockTaskTree } from './tree'

/**
 * A parent's status is worked out from its children (FR-038) and written into its own `status`
 * column, so every read that filters by status sees it without recursing. This settles the chain
 * above a task whose status, place or existence just changed: each ancestor in turn, bottom up,
 * written only when its derived status differs from what it holds, and logged as a
 * `status_changed` with `derived: true` so the review can tell it from a change somebody made.
 *
 * `removed` says the caller just took a child away: an ancestor left with no live children has
 * turned back into a leaf (FR-039), which is logged once and keeps the status it had derived.
 *
 * Runs inside the caller's transaction under the tree lock; a chain is at most MAX_TASK_DEPTH
 * long, so the walk is bounded.
 */
async function settleAncestors(
  tx: Tx,
  ctx: Actor,
  parentId: TaskId | null,
  opts: { removed?: boolean } = {},
): Promise<void> {
  const log = taskLog(tx, ctx)
  let id = parentId
  let removed = opts.removed ?? false
  while (id !== null) {
    const [parent] = await tx.select().from(tasks).where(eq(tasks.id, id)).for('update')
    if (!parent) return
    const derived = derivedStatus(await childStatuses(tx, parent.id))
    if (derived === null) {
      // No live children left: a leaf again, keeping the last derived status.
      if (removed) await log.append(parent.id, 'became_leaf', { status: parent.status })
      removed = false
    } else if (derived !== parent.status) {
      await tx
        .update(tasks)
        .set({
          status: derived,
          completedAt: derived === 'done' ? ctx.now : null,
          updatedAt: ctx.now,
        })
        .where(eq(tasks.id, parent.id))
      await log.append(parent.id, 'status_changed', {
        from: parent.status,
        to: derived,
        derived: true,
      })
      removed = false
    } else {
      // Unchanged here means unchanged above: a parent's status depends on its children alone.
      return
    }
    id = parent.parentId
  }
}

/**
 * What happens to a leaf that is about to get its first child (FR-039): it is logged as a parent
 * from now on, and its planned day, which only a leaf can have (FR-043), moves down to the new
 * child when that child has none, or is dropped. Returns the planned day the child should take.
 * Call before the child is written, while the parent is still a leaf.
 */
async function becomeParent(tx: Tx, ctx: Actor, parent: Task): Promise<string | null> {
  if ((await childStatuses(tx, parent.id)).length > 0) return null
  const log = taskLog(tx, ctx)
  await log.append(parent.id, 'became_parent', {})
  if (parent.scheduledOn === null) return null
  await tx
    .update(tasks)
    .set({ scheduledOn: null, updatedAt: ctx.now })
    .where(eq(tasks.id, parent.id))
  await log.append(parent.id, 'scheduled_changed', { from: parent.scheduledOn, to: null })
  return parent.scheduledOn
}

/**
 * Appends a task after its last sibling. Under a parent it takes the parent's project; the
 * requested project must still be visible, as on move.
 */
export async function createTask(db: Db, ctx: Actor, input: CreateTaskBody): Promise<Task> {
  return db.transaction(async (tx) => {
    await lockTaskTree(tx, ctx.workspaceId)
    let projectId = (await getProject(tx, ctx.workspaceId, input.projectId)).id

    let scheduledOn = input.scheduledOn ?? null
    if (input.parentId) {
      const parent = await lockTask(tx, ctx.workspaceId, input.parentId)
      if ((await depthOf(tx, parent.id)) + 1 > MAX_TASK_DEPTH) throw new DepthLimitError()
      projectId = parent.projectId
      const handedDown = await becomeParent(tx, ctx, parent)
      if (scheduledOn === null) scheduledOn = handedDown
    }

    const [last] = await tx
      .select({ rank: tasks.rank })
      .from(tasks)
      .where(
        and(
          eq(tasks.projectId, projectId),
          input.parentId ? eq(tasks.parentId, input.parentId) : isNull(tasks.parentId),
          isNull(tasks.deletedAt),
        ),
      )
      .orderBy(desc(tasks.rank), desc(tasks.id))
      .limit(1)

    const stage = input.stageId
      ? await getStage(tx, ctx.workspaceId, projectId, input.stageId)
      : null
    const [row] = await tx
      .insert(tasks)
      .values({
        id: newId(taskId),
        workspaceId: ctx.workspaceId,
        projectId,
        parentId: input.parentId ?? null,
        title: input.title,
        notes: input.notes ?? null,
        status: input.status,
        scheduledOn,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        stageId: stage?.id ?? null,
        stageSince: stage ? ctx.now : null,
        completedAt: input.status === 'done' ? ctx.now : null,
        createdAt: ctx.now,
        updatedAt: ctx.now,
        rank: rankBetween(last?.rank ?? null, null),
      })
      .returning()

    await taskLog(tx, ctx).append(row!.id, 'created', {
      from: null,
      to: { title: row!.title, status: row!.status, parentId: row!.parentId, projectId },
    })
    if (stage)
      await taskLog(tx, ctx).append(row!.id, 'stage_changed', { from: null, to: stage.name })
    await settleAncestors(tx, ctx, row!.parentId)
    if (row!.notes) await syncMentions(tx, ctx, { type: 'task', id: row!.id }, 'notes', row!.notes)
    return row!
  })
}

/** A task's own fields: everything a PATCH carries but its position. */
type Fields = Pick<
  UpdateTaskBody,
  'title' | 'notes' | 'status' | 'scheduledOn' | 'dueAt' | 'stageId'
>

/**
 * Applies a PATCH in one transaction: the move first, when it names a position, then the task's
 * own fields. A refused move leaves the fields as they were.
 */
export async function updateTask(
  db: Db,
  ctx: Actor,
  id: TaskId,
  body: UpdateTaskBody,
): Promise<Task> {
  const { projectId, parentId, beforeId, afterId, ...fields } = body
  return db.transaction(async (tx) => {
    const moved =
      projectId !== undefined && parentId !== undefined
        ? await moveTask(tx, ctx, id, { projectId, parentId, beforeId, afterId })
        : null
    return Object.keys(fields).length > 0 || !moved ? editTask(tx, ctx, id, fields) : moved
  })
}

/**
 * Patches the task's own fields, one event per field that changed. A patch that changes nothing
 * writes nothing, so it does not count as activity. Status never touches another task.
 */
async function editTask(tx: Tx, ctx: Actor, id: TaskId, patch: Fields): Promise<Task> {
  const row = await lockTask(tx, ctx.workspaceId, id)

  // A parent's status and planned day are its children's to decide.
  if (patch.status !== undefined || patch.scheduledOn !== undefined) {
    if ((await childStatuses(tx, row.id)).length > 0) {
      throw new DerivedFieldError(patch.status !== undefined ? 'status' : 'scheduledOn')
    }
  }

  const set: PgUpdateSetSource<typeof tasks> = {}
  const events: { type: TaskEventType; payload: unknown }[] = []

  if (patch.title !== undefined && patch.title !== row.title) {
    set.title = patch.title
    events.push({ type: 'title_changed', payload: { from: row.title, to: patch.title } })
  }
  if (patch.notes !== undefined && patch.notes !== row.notes) {
    set.notes = patch.notes
    events.push({ type: 'notes_changed', payload: { from: row.notes, to: patch.notes } })
  }
  if (patch.status !== undefined && patch.status !== row.status) {
    set.status = patch.status
    // completed_at means "currently done", so leaving done clears it.
    set.completedAt = patch.status === 'done' ? ctx.now : null
    events.push({ type: 'status_changed', payload: { from: row.status, to: patch.status } })
  }
  if (patch.scheduledOn !== undefined && patch.scheduledOn !== row.scheduledOn) {
    set.scheduledOn = patch.scheduledOn
    events.push({
      type: 'scheduled_changed',
      payload: { from: row.scheduledOn, to: patch.scheduledOn },
    })
  }
  if (patch.dueAt !== undefined) {
    const next = patch.dueAt === null ? null : new Date(patch.dueAt)
    if (next?.getTime() !== row.dueAt?.getTime()) {
      set.dueAt = next
      events.push({
        type: 'due_changed',
        payload: { from: isoOrNull(row.dueAt), to: isoOrNull(next) },
      })
    }
  }
  if (patch.stageId !== undefined && patch.stageId !== row.stageId) {
    // One of this task's project's stages, by name in the log so the review can read it.
    const from = row.stageId
      ? await getStage(tx, ctx.workspaceId, row.projectId, row.stageId)
      : null
    const to = patch.stageId
      ? await getStage(tx, ctx.workspaceId, row.projectId, patch.stageId)
      : null
    set.stageId = to?.id ?? null
    set.stageSince = to ? ctx.now : null
    events.push({
      type: 'stage_changed',
      payload: { from: from?.name ?? null, to: to?.name ?? null },
    })
  }
  if (events.length === 0) return row

  set.updatedAt = ctx.now
  const [updated] = await tx.update(tasks).set(set).where(eq(tasks.id, id)).returning()
  const log = taskLog(tx, ctx)
  for (const e of events) await log.append(id, e.type, e.payload)
  if (set.status !== undefined) {
    // A status change is a shape change for the parent: take the tree lock before settling.
    await lockTaskTree(tx, ctx.workspaceId)
    await settleAncestors(tx, ctx, row.parentId)
  }
  if (set.notes !== undefined) {
    await syncMentions(tx, ctx, { type: 'task', id }, 'notes', updated!.notes)
  }
  return updated!
}

const descendant = z.object({ id: taskId, depth: z.number(), live: z.boolean() })

type Descendant = z.output<typeof descendant>

/**
 * Every row under `rootId` (itself at depth 0) and whether it is live. The cycle check reads all
 * rows, the height check only live ones, and the project cascade writes all of them.
 *
 * The depth bound can cut the walk short, but only where the destination would sit more than
 * MAX_TASK_DEPTH below the moved task, which the depth check in `moveTask` always refuses; keep that
 * check after this one.
 */
async function descendantsOf(q: Queryable, rootId: TaskId): Promise<Descendant[]> {
  const result = await q.execute(sql`
    with recursive subtree(id, depth, deleted_at) as (
      select id, 0, deleted_at from tasks where id = ${rootId}
      union
      select t.id, s.depth + 1, t.deleted_at
      from tasks t join subtree s on t.parent_id = s.id
      where s.depth < ${MAX_TASK_DEPTH}
    )
    select id, depth, (deleted_at is null) as live from subtree
  `)
  return rowsOf(result, descendant)
}

/**
 * Moves a task to a new parent, possibly in another project, at the slot next to the neighbour
 * the client names. Under a parent the parent's project wins, as on create. The caller's
 * transaction must not have written yet: the tree lock is its first statement.
 */
async function moveTask(tx: Tx, ctx: Actor, id: TaskId, input: TaskPosition): Promise<Task> {
  if (input.beforeId !== undefined && input.afterId !== undefined) {
    throw new BothNeighboursError()
  }

  await lockTaskTree(tx, ctx.workspaceId)
  const task = await lockTask(tx, ctx.workspaceId, id)
  const projectId = (await getProject(tx, ctx.workspaceId, input.projectId)).id

  // A deleted parent reads as not found.
  const parent = input.parentId ? await lockTask(tx, ctx.workspaceId, input.parentId) : null
  const destProjectId = parent ? parent.projectId : projectId
  const destParentId = parent ? parent.id : null

  const subtree = await descendantsOf(tx, id)
  if (destParentId !== null && subtree.some((d) => d.id === destParentId))
    throw new MoveCycleError()

  // The parent's depth plus the moved subtree's live height, not its row count.
  const parentDepth = destParentId === null ? 0 : await depthOf(tx, destParentId)
  const liveHeight = Math.max(...subtree.filter((d) => d.live).map((d) => d.depth)) + 1
  if (parentDepth + liveHeight > MAX_TASK_DEPTH) throw new DepthLimitError()

  const rank = await rankFor(tx, { id, destProjectId, destParentId, input })

  const parentChanged = destParentId !== task.parentId
  const projectChanged = destProjectId !== task.projectId

  // Arriving under a leaf turns it into a parent; the moved task keeps its own planned day, so
  // what the new parent hands down goes nowhere.
  if (parentChanged && parent) await becomeParent(tx, ctx, parent)

  const [updated] = await tx
    .update(tasks)
    .set({
      parentId: destParentId,
      projectId: destProjectId,
      rank,
      updatedAt: ctx.now,
      // A stage is the old project's, so it does not travel.
      ...(projectChanged ? { stageId: null, stageSince: null } : {}),
    })
    .where(eq(tasks.id, id))
    .returning()

  if (projectChanged) {
    // Deleted rows too: their logged history is counted by the project they sit in. A stage is
    // the old project's, so it does not travel.
    await tx.execute(sql`
      with recursive subtree(id) as (
        select ${id}::uuid
        union
        select t.id from tasks t join subtree s on t.parent_id = s.id
      )
      update tasks
      set project_id = ${destProjectId}, stage_id = null, stage_since = null,
          updated_at = ${instant(ctx.now)}
      where id in (select id from subtree) and project_id <> ${destProjectId}
    `)
  }

  // A pure reorder is not logged, so tidying up never reads as progress. The descendants the
  // cascade carried along get no event of their own.
  if (parentChanged || projectChanged) {
    await taskLog(tx, ctx).append(id, 'moved', {
      from: { parentId: task.parentId, ...(projectChanged ? { projectId: task.projectId } : {}) },
      to: { parentId: destParentId, ...(projectChanged ? { projectId: destProjectId } : {}) },
    })
  }

  if (parentChanged) {
    await settleAncestors(tx, ctx, task.parentId, { removed: true })
    await settleAncestors(tx, ctx, destParentId)
  }

  return updated!
}

/**
 * The rank for the slot: `beforeId` lands ahead of that sibling, `afterId` behind it, neither at
 * the end. Only the moved row is written, never its siblings.
 */
async function rankFor(
  tx: Queryable,
  args: { id: TaskId; destProjectId: ProjectId; destParentId: TaskId | null; input: TaskPosition },
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
    throw new InvalidNeighbourError()
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

/**
 * Soft-deletes a task and its live descendants, so no read has to check ancestors. Each gets its
 * own `deleted` event; a descendant's names the task the cascade started from.
 */
export async function softDeleteTask(db: Db, ctx: Actor, id: TaskId): Promise<void> {
  await db.transaction(async (tx) => {
    await lockTaskTree(tx, ctx.workspaceId)
    const log = taskLog(tx, ctx)
    const task = await lockTask(tx, ctx.workspaceId, id)

    // The two `deleted_at is null` differ: the recursive one prunes, so an already-deleted
    // descendant keeps its own `deleted_at`; the update's one refuses to overwrite and picks the
    // rows that get an event. They disagree only on a live task under a deleted parent, which
    // move (refusing a deleted parent), create (the visibility predicate) and the tree lock rule out.
    const result = await tx.execute(sql`
      with recursive subtree(id) as (
        select ${id}::uuid
        union
        select t.id from tasks t join subtree s on t.parent_id = s.id where t.deleted_at is null
      )
      update tasks set deleted_at = ${instant(ctx.now)}, updated_at = ${instant(ctx.now)}
      where id in (select id from subtree) and deleted_at is null
      returning id
    `)
    await log.appendAll(
      rowsOf(result, z.object({ id: taskId })).map(({ id: deletedId }) => ({
        taskId: deletedId,
        type: 'deleted',
        payload: deletedId === id ? {} : { cascadedFrom: id },
      })),
    )
    await settleAncestors(tx, ctx, task.parentId, { removed: true })
  })
}

/** `blockedId` waits for `blockerId`. */
type Edge = { blockedId: TaskId; blockerId: TaskId }

/**
 * Would `blocker -> blocked` close a loop, i.e. is `blocked` already upstream of `blocker`?
 * `union` keeps a diamond from being walked once per path. The walk goes through live tasks only,
 * as the reads do: a deleted task's edges stay stored but hold nobody up.
 */
async function wouldCycle(
  q: Queryable,
  workspaceId: WorkspaceId,
  { blockedId, blockerId }: Edge,
): Promise<boolean> {
  const rows = await q.execute(sql`
    with recursive upstream(id) as (
      select ${blockerId}::uuid
      union
      select d.blocker_id
      from task_dependencies d
      join upstream u on u.id = d.blocked_id
      join tasks t on t.id = d.blocker_id
      join projects p on p.id = t.project_id
      where ${scoped(taskDependencies, workspaceId, 'd')}
        and ${visibleTasks(workspaceId, { task: 't', project: 'p' })}
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
  ctx: Actor,
  { blockedId, blockerId }: Edge,
): Promise<void> {
  if (blockedId === blockerId) throw new DependencyCycleError()
  await db.transaction(async (tx) => {
    // The loop check is read-then-write: two opposite adds must not both pass it.
    await lockTaskTree(tx, ctx.workspaceId)
    // A foreign id reads as not found, never as a refusal that confirms it exists.
    await getTask(tx, ctx.workspaceId, blockedId)
    await getTask(tx, ctx.workspaceId, blockerId)
    if (await wouldCycle(tx, ctx.workspaceId, { blockedId, blockerId }))
      throw new DependencyCycleError()

    const added = await tx
      .insert(taskDependencies)
      .values({ blockerId, blockedId, workspaceId: ctx.workspaceId, createdAt: ctx.now })
      .onConflictDoNothing()
      .returning({ blockerId: taskDependencies.blockerId })
    if (added.length === 0) return
    await taskLog(tx, ctx).append(blockedId, 'dependency_added', { blockerId })
  })
}

/**
 * Forgets that `blockedId` waits for `blockerId`. Also idempotent: an edge that is not there is
 * already gone, but a task that is not there has no edges to ask about.
 */
export async function removeDependency(
  db: Db,
  ctx: Actor,
  { blockedId, blockerId }: Edge,
): Promise<void> {
  await db.transaction(async (tx) => {
    await getTask(tx, ctx.workspaceId, blockedId)
    const removed = await tx
      .delete(taskDependencies)
      .where(
        within(
          scoped(taskDependencies, ctx.workspaceId),
          eq(taskDependencies.blockedId, blockedId),
          eq(taskDependencies.blockerId, blockerId),
        ),
      )
      .returning({ blockerId: taskDependencies.blockerId })
    if (removed.length === 0) return
    await taskLog(tx, ctx).append(blockedId, 'dependency_removed', { blockerId })
  })
}
