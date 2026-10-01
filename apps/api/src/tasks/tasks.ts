import type { CreateTaskBody, UpdateTaskBody } from '@ctws/contracts'
import { rankBetween } from '@ctws/core'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core'
import { v7 as uuidv7 } from 'uuid'
import type { Db, Queryable } from '../db/client'
import { projects, tasks } from '../db/schema'
import { appendEvent, type AppendEventInput } from './events'
import { ProjectNotFoundError } from './projects'

export type Task = typeof tasks.$inferSelect

/** Spec 5.2: the deepest allowed nesting. A root task is at depth 1. */
export const MAX_DEPTH = 10

/** Who is acting, and in which workspace. Every service function takes it, never a bare id. */
export type TaskCtx = { workspaceId: string; actorUserId: string }

/**
 * Raised when a task does not exist, is soft-deleted, or belongs to another workspace. One error
 * on purpose, for the same reason as `ProjectNotFoundError`: ids must not be probeable.
 */
export class TaskNotFoundError extends Error {
  constructor() {
    super('Task not found')
    this.name = 'TaskNotFoundError'
  }
}

export class DepthLimitError extends Error {
  constructor() {
    super(`Tasks can be nested at most ${MAX_DEPTH} levels deep`)
    this.name = 'DepthLimitError'
  }
}

export class ManualProgressOnParentError extends Error {
  constructor() {
    super('Manual progress can only be set on a task without children')
    this.name = 'ManualProgressOnParentError'
  }
}

/**
 * Number of tasks on the path from `taskId` up to its root, itself included, so a root is 1.
 * Walks upward, which costs at most MAX_DEPTH steps, whereas counting down would visit a whole
 * subtree. UNION (not UNION ALL) means a corrupted cycle terminates instead of looping forever.
 * Soft-deleted ancestors still count: deleting a task must not shorten the path above it.
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

/**
 * Loads a live task in the caller's workspace and locks it for the rest of the transaction.
 * The workspace is reached through one join to `projects` (spec 10.5: `tasks` carries no
 * `workspace_id` of its own), and a task in a deleted project is as invisible as a deleted task.
 */
async function lockVisibleTask(q: Queryable, workspaceId: string, id: string): Promise<Task> {
  const [row] = await q
    .select({ task: tasks })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(
      and(
        eq(tasks.id, id),
        isNull(tasks.deletedAt),
        eq(projects.workspaceId, workspaceId),
        isNull(projects.deletedAt),
      ),
    )
    .for('update', { of: tasks })
  if (!row) throw new TaskNotFoundError()
  return row.task
}

/** Numeric columns come back as strings; normalise so comparisons and payloads use numbers. */
function progressOf(raw: string | null): number | null {
  return raw === null ? null : Number(raw)
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null)

/**
 * Creates a task appended after its last sibling. The depth limit is checked here as well as on
 * move (spec 5.2): otherwise a shallow tree could be built and then moved into a deep one, or a
 * deep one grown by create alone.
 *
 * With a parent, `project_id` is taken from the parent and the client's `projectId` is ignored
 * (spec 5.1: a child's project must equal its parent's).
 */
export async function createTask(db: Db, ctx: TaskCtx, input: CreateTaskBody): Promise<Task> {
  return db.transaction(async (tx) => {
    let projectId: string
    if (input.parentId) {
      const parent = await lockVisibleTask(tx, ctx.workspaceId, input.parentId)
      if ((await depthOf(tx, parent.id)) + 1 > MAX_DEPTH) throw new DepthLimitError()
      projectId = parent.projectId

      // The parent stops being a leaf, and manual progress is leaf-only (spec 5.2): clear it,
      // and say so in the log rather than rewriting history silently.
      if (parent.manualProgress !== null) {
        await tx
          .update(tasks)
          .set({ manualProgress: null, updatedAt: sql`now()` })
          .where(eq(tasks.id, parent.id))
        await appendEvent(tx, {
          taskId: parent.id,
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.actorUserId,
          type: 'progress_set',
          payload: { from: progressOf(parent.manualProgress), to: null },
        })
      }
    } else {
      const [project] = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.id, input.projectId),
            eq(projects.workspaceId, ctx.workspaceId),
            isNull(projects.deletedAt),
          ),
        )
      if (!project) throw new ProjectNotFoundError()
      projectId = project.id
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

    const [row] = await tx
      .insert(tasks)
      .values({
        id: uuidv7(),
        projectId,
        parentId: input.parentId ?? null,
        title: input.title,
        notes: input.notes ?? null,
        status: input.status,
        scheduledOn: input.scheduledOn ?? null,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        manualProgress: input.manualProgress == null ? null : input.manualProgress.toFixed(2),
        completedAt: input.status === 'done' ? sql`now()` : null,
        rank: rankBetween(last?.rank ?? null, null),
      })
      .returning()

    await appendEvent(tx, {
      taskId: row!.id,
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.actorUserId,
      type: 'created',
      payload: {
        from: null,
        to: { title: row!.title, status: row!.status, parentId: row!.parentId, projectId },
      },
    })
    return row!
  })
}

/**
 * Patches the independent scalar fields. One event per field that actually changed, none for a
 * patch that changes nothing (a PATCH that re-sends the current values must not look like
 * activity to stall detection, spec 9.3).
 *
 * Status is set independently of the task's parent and children (spec 6.4): nothing here reads
 * or writes any other task's status.
 */
export async function updateTask(
  db: Db,
  ctx: TaskCtx,
  id: string,
  patch: UpdateTaskBody,
): Promise<Task> {
  return db.transaction(async (tx) => {
    const row = await lockVisibleTask(tx, ctx.workspaceId, id)

    const set: PgUpdateSetSource<typeof tasks> = {}
    const events: Pick<AppendEventInput, 'type' | 'payload'>[] = []

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
      // completed_at tracks "currently done", so it is cleared on leaving done.
      set.completedAt = patch.status === 'done' ? sql`now()` : null
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
        events.push({ type: 'due_changed', payload: { from: iso(row.dueAt), to: iso(next) } })
      }
    }
    if (patch.manualProgress !== undefined) {
      const next = patch.manualProgress === null ? null : Number(patch.manualProgress.toFixed(2))
      const prev = progressOf(row.manualProgress)
      if (next !== prev) {
        if (next !== null) {
          const [child] = await tx
            .select({ id: tasks.id })
            .from(tasks)
            .where(and(eq(tasks.parentId, id), isNull(tasks.deletedAt)))
            .limit(1)
          if (child) throw new ManualProgressOnParentError()
        }
        set.manualProgress = next === null ? null : next.toFixed(2)
        events.push({ type: 'progress_set', payload: { from: prev, to: next } })
      }
    }

    if (events.length === 0) return row

    set.updatedAt = sql`now()`
    const [updated] = await tx.update(tasks).set(set).where(eq(tasks.id, id)).returning()
    for (const e of events) {
      await appendEvent(tx, {
        taskId: id,
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.actorUserId,
        ...e,
      })
    }
    return updated!
  })
}

/**
 * Soft-deletes a task together with its live descendants. Cascading in the data, rather than
 * hiding children at read time, means no query (today view, board, review) can forget to look at
 * ancestors and show a task whose parent is gone. Each task gets its own `deleted` event so the
 * log has no hole; descendants carry `cascadedFrom` so the cause is recoverable.
 */
export async function softDeleteTask(db: Db, ctx: TaskCtx, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    await lockVisibleTask(tx, ctx.workspaceId, id)

    const result = await tx.execute(sql`
      with recursive subtree(id) as (
        select ${id}::uuid
        union
        select t.id from tasks t join subtree s on t.parent_id = s.id where t.deleted_at is null
      )
      update tasks set deleted_at = now(), updated_at = now()
      where id in (select id from subtree) and deleted_at is null
      returning id
    `)
    for (const { id: deletedId } of result.rows as { id: string }[]) {
      await appendEvent(tx, {
        taskId: deletedId,
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.actorUserId,
        type: 'deleted',
        payload: deletedId === id ? {} : { cascadedFrom: id },
      })
    }
  })
}
