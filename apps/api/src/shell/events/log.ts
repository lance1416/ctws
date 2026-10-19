import type { ObjectType } from '@ctws/contracts'
import { v7 as uuidv7 } from 'uuid'
import type { Tx } from '../../platform/db/client'
import type { Actor } from '../../platform/db/scope'
import { events } from './tables'

/** The thing an event is about. */
export type Subject = { type: ObjectType; id: string }

type LogEvent = { subject: Subject; type: string; payload: unknown }

/**
 * The change log, for every kind of thing (FR-044). It runs inside the caller's transaction, so a
 * rolled-back command leaves no trace. A command's events share its instant; their ids are
 * time-ordered, so `(occurred_at, id)` is the order they were written in.
 *
 * Each module names its own event types (`TASK_EVENT_TYPES` and the like) and keeps the payload
 * shapes beside them; the log stores whatever it is given.
 */
export function eventLog(q: Tx, ctx: Actor) {
  const row = (e: LogEvent) => ({
    id: uuidv7(),
    workspaceId: ctx.workspaceId,
    objectType: e.subject.type,
    objectId: e.subject.id,
    type: e.type,
    payload: e.payload,
    occurredAt: ctx.now,
  })
  return {
    async append(subject: Subject, type: string, payload: unknown): Promise<void> {
      await q.insert(events).values(row({ subject, type, payload }))
    },
    /** Several events in one insert, in the order given. */
    async appendAll(list: readonly LogEvent[]): Promise<void> {
      if (list.length > 0) await q.insert(events).values(list.map(row))
    },
  }
}
