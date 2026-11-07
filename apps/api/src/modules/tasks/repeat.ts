import { taskId, type TaskId } from '@ctws/contracts'
import { addDays, dayIn, handOn, nextRepeatDay, rankBetween } from '@ctws/core'
import { and, asc, eq, gt, isNull } from 'drizzle-orm'
import type { Tx } from '../../platform/db/client'
import { newId } from '../../platform/db/ids'
import type { Actor } from '../../platform/db/scope'
import { instantOf, localOf } from '../../platform/zone'
import { syncMentions } from '../../shell/relations'
import { taskLog } from './log'
import { type Task, tasks } from './tables'

/** What a repeat counts from: the account's day and zone, which the request knows. */
export type Calendar = { today: string; zone: string }

const DAY_MS = 86_400_000

/** The same wall-clock time in `zone`, `days` later: a deadline at 16:00 stays at 16:00. */
function shiftDue(due: Date, days: number, zone: string): Date {
  const local = localOf(due, zone)
  return instantOf(`${addDays(local.slice(0, 10), days)}${local.slice(10)}`, zone)
}

/**
 * Makes the next one of a repeating task that was just done or cancelled, once: the same title,
 * notes, project, parent and stage, to do, right after it among its siblings. Its plan and its
 * deadline move together by the same number of days, so a deadline three days after the plan
 * stays three days after it. Nothing is made when the rule has run out, or the next was made
 * already. Returns the new task's id. The caller holds the tree lock.
 */
export async function comeRound(
  tx: Tx,
  ctx: Actor,
  row: Task,
  cal: Calendar,
): Promise<TaskId | null> {
  if (!row.repeat || row.nextId !== null) return null
  const anchor = row.scheduledOn ?? (row.dueAt ? dayIn(row.dueAt, cal.zone) : null)
  if (anchor === null) return null
  const nextDay = nextRepeatDay(row.repeat, { anchor, today: cal.today, doneOn: cal.today })
  if (nextDay === null) return null
  const days = Math.round((Date.parse(nextDay) - Date.parse(anchor)) / DAY_MS)

  const [after] = await tx
    .select({ rank: tasks.rank })
    .from(tasks)
    .where(
      and(
        eq(tasks.projectId, row.projectId),
        row.parentId ? eq(tasks.parentId, row.parentId) : isNull(tasks.parentId),
        isNull(tasks.deletedAt),
        gt(tasks.rank, row.rank),
      ),
    )
    .orderBy(asc(tasks.rank), asc(tasks.id))
    .limit(1)

  const id = newId(taskId)
  const [next] = await tx
    .insert(tasks)
    .values({
      id,
      workspaceId: row.workspaceId,
      projectId: row.projectId,
      parentId: row.parentId,
      title: row.title,
      notes: row.notes,
      status: 'todo',
      scheduledOn: row.scheduledOn ? addDays(row.scheduledOn, days) : null,
      dueAt: row.dueAt ? shiftDue(row.dueAt, days, cal.zone) : null,
      stageId: row.stageId,
      stageSince: row.stageId ? ctx.now : null,
      repeat: handOn(row.repeat, anchor),
      rank: rankBetween(row.rank, after?.rank ?? null),
      createdAt: ctx.now,
      updatedAt: ctx.now,
    })
    .returning()
  await tx.update(tasks).set({ nextId: id }).where(eq(tasks.id, row.id))

  const log = taskLog(tx, ctx)
  await log.append(id, 'created', {
    from: null,
    to: {
      title: next!.title,
      status: next!.status,
      parentId: next!.parentId,
      projectId: next!.projectId,
    },
  })
  if (next!.notes) await syncMentions(tx, ctx, { type: 'task', id }, 'notes', next!.notes)
  return id
}
