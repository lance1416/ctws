import { type TaskEventType, type TaskId } from '@ctws/contracts'
import { v7 as uuidv7 } from 'uuid'
import type { Tx } from '../../platform/db/client'
import type { Actor } from '../../platform/db/scope'
import { taskEvents } from './tables'

/**
 * The event log. It runs inside the caller's transaction. A command's events share its instant;
 * their ids are time-ordered, so `(occurred_at, id)` is the order they were written in.
 */
export function taskLog(q: Tx, ctx: Actor) {
  return {
    async append(taskId: TaskId, type: TaskEventType, payload: unknown): Promise<void> {
      await q.insert(taskEvents).values({
        id: uuidv7(),
        taskId,
        workspaceId: ctx.workspaceId,
        type,
        payload,
        occurredAt: ctx.now,
      })
    },
  }
}
