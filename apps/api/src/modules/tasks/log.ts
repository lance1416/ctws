import type { TaskEventType } from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import type { Queryable } from '../../platform/db/client'
import { taskEvents } from './tables'

/** Who is acting, and in which workspace. */
export type TaskCtx = { workspaceId: string; actorUserId: string }

/** Edits that merge while the person is still typing; every other type is its own fact. */
const COALESCING: ReadonlySet<TaskEventType> = new Set(['title_changed', 'notes_changed'])
const COALESCE_WINDOW_SECONDS = 300

type Event = TaskCtx & { taskId: string; type: TaskEventType; payload: unknown }

/** The event log for one actor. It runs inside the caller's transaction. */
export function taskLog(q: Queryable, ctx: TaskCtx) {
  return {
    async append(taskId: string, type: TaskEventType, payload: unknown): Promise<void> {
      const event: Event = { ...ctx, taskId, type, payload }
      if (COALESCING.has(type) && (await coalesce(q, event))) return
      await q.insert(taskEvents).values({
        id: uuidv7(),
        ...event,
        occurredAt: sql`clock_timestamp()`,
      })
    },
  }
}

export type TaskLog = ReturnType<typeof taskLog>

/**
 * Merges into the same actor's latest event of the same type on the task, if it is inside the
 * window, keeping the original `from`. Two concurrent first writes may each insert; both are true.
 */
async function coalesce(q: Queryable, e: Event): Promise<boolean> {
  const result = await q.execute(sql`
    update task_events
    set payload = payload || jsonb_build_object('to', (${JSON.stringify(e.payload)}::jsonb) -> 'to'),
        occurred_at = clock_timestamp()
    where id = (
      select id from task_events
      where task_id = ${e.taskId}
        and type = ${e.type}
        and actor_user_id = ${e.actorUserId}
        and occurred_at > clock_timestamp() - make_interval(secs => ${COALESCE_WINDOW_SECONDS})
      order by occurred_at desc
      limit 1
      for update
    )
    returning id
  `)
  return result.rows.length > 0
}
