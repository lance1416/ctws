import type { ObjectType, WorkspaceId } from '@ctws/contracts'
import { and, asc, between, eq, lte } from 'drizzle-orm'
import type { Queryable } from '../../platform/db/client'
import type { Actor } from '../../platform/db/scope'
import { reminders } from './tables'

type Thing = { type: ObjectType; id: string }
export type ReminderRow = typeof reminders.$inferSelect

const at = (workspaceId: WorkspaceId, thing: Thing) =>
  and(
    eq(reminders.workspaceId, workspaceId),
    eq(reminders.objectType, thing.type),
    eq(reminders.objectId, thing.id),
  )

/** Sets a thing's reminder, replacing the one it had: one a thing. */
export async function setReminder(
  q: Queryable,
  ctx: Actor,
  thing: Thing,
  set: { onDay: string; why: string | null },
): Promise<ReminderRow> {
  const [row] = await q
    .insert(reminders)
    .values({
      workspaceId: ctx.workspaceId,
      objectType: thing.type,
      objectId: thing.id,
      onDay: set.onDay,
      why: set.why,
      createdAt: ctx.now,
    })
    .onConflictDoUpdate({
      target: [reminders.objectType, reminders.objectId],
      set: { onDay: set.onDay, why: set.why, createdAt: ctx.now },
    })
    .returning()
  return row!
}

export async function reminderOf(
  q: Queryable,
  workspaceId: WorkspaceId,
  thing: Thing,
): Promise<ReminderRow | null> {
  const [row] = await q.select().from(reminders).where(at(workspaceId, thing))
  return row ?? null
}

export async function dismissReminder(
  q: Queryable,
  workspaceId: WorkspaceId,
  thing: Thing,
): Promise<void> {
  await q.delete(reminders).where(at(workspaceId, thing))
}

/** Every reminder whose day has come by `today`, oldest day first. */
export async function remindersDue(
  q: Queryable,
  workspaceId: WorkspaceId,
  today: string,
): Promise<ReminderRow[]> {
  return q
    .select()
    .from(reminders)
    .where(and(eq(reminders.workspaceId, workspaceId), lte(reminders.onDay, today)))
    .orderBy(asc(reminders.onDay), asc(reminders.createdAt))
}

/** The reminders that come up between two days, both included. */
export async function remindersBetween(
  q: Queryable,
  workspaceId: WorkspaceId,
  from: string,
  to: string,
): Promise<ReminderRow[]> {
  return q
    .select()
    .from(reminders)
    .where(and(eq(reminders.workspaceId, workspaceId), between(reminders.onDay, from, to)))
    .orderBy(asc(reminders.onDay), asc(reminders.createdAt))
}
