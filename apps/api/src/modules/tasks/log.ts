import { type TaskEventType, type TaskId } from '@ctws/contracts'
import { v7 as uuidv7 } from 'uuid'
import type { Tx } from '../../platform/db/client'
import type { Actor } from '../../platform/db/scope'
import { taskEvents } from './tables'

/**
 * The event log. It runs inside the caller's transaction. A command's events share its instant;
 * their ids are time-ordered, so `(occurred_at, id)` is the order they were written in.
 */
type LogEvent = { taskId: TaskId; type: TaskEventType; payload: unknown }

export function taskLog(q: Tx, ctx: Actor) {
  const row = (e: LogEvent) => ({
    id: uuidv7(),
    workspaceId: ctx.workspaceId,
    ...e,
    occurredAt: ctx.now,
  })
  return {
    async append(taskId: TaskId, type: TaskEventType, payload: unknown): Promise<void> {
      await q.insert(taskEvents).values(row({ taskId, type, payload }))
    },
    /** Several events in one insert, in the order given. */
    async appendAll(events: readonly LogEvent[]): Promise<void> {
      if (events.length > 0) await q.insert(taskEvents).values(events.map(row))
    },
  }
}
