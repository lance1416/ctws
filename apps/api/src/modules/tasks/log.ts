import { type TaskEventType, type TaskId, type WorkspaceId } from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import type { Queryable } from '../../platform/db/client'
import { taskEvents } from './tables'

/** The workspace a command acts in. */
export type TaskCtx = { workspaceId: WorkspaceId }

/** The event log. It runs inside the caller's transaction. */
export function taskLog(q: Queryable, ctx: TaskCtx) {
  return {
    async append(taskId: TaskId, type: TaskEventType, payload: unknown): Promise<void> {
      await q.insert(taskEvents).values({
        id: uuidv7(),
        taskId,
        workspaceId: ctx.workspaceId,
        type,
        payload,
        occurredAt: sql`clock_timestamp()`,
      })
    },
  }
}
