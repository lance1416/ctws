import type { TaskEventType, UpdateTaskBody } from '@ctws/contracts'
import { and, eq, isNull, sql } from 'drizzle-orm'
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core'
import type { Db } from '../../../platform/db/client'
import { isoOrNull } from '../../../platform/values'
import { ManualProgressOnParentError } from '../errors'
import { taskLog, type TaskCtx } from '../log'
import { lockVisibleTask } from '../queries/scope'
import { tasks, type Task } from '../tables'

/** `numeric` comes back as a string. */
const progressOf = (raw: string | null): number | null => (raw === null ? null : Number(raw))

/**
 * Patches the task's own fields, one event per field that changed. A patch that changes nothing
 * writes nothing, so it does not count as activity. Status never touches another task.
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
        events.push({
          type: 'due_changed',
          payload: { from: isoOrNull(row.dueAt), to: isoOrNull(next) },
        })
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
    const log = taskLog(tx, ctx)
    for (const e of events) await log.append(id, e.type, e.payload)
    return updated!
  })
}
