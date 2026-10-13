import type { TaskEventType } from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import type { Queryable } from '../../platform/db/client'
import { taskEvents } from './tables'

const COALESCE_WINDOW_MS = 5 * 60 * 1000

/**
 * Text-edit events that merge while the user is still typing. Every other type is a distinct
 * fact and always appends. There is deliberately no reorder/rank event type: a pure rank change
 * is not logged at all (spec 9.1), so it neither floods the weekly review nor moves the
 * "last activity" timestamp that stall detection reads.
 */
const COALESCING_TYPES: ReadonlySet<TaskEventType> = new Set<TaskEventType>([
  'title_changed',
  'notes_changed',
])

export type AppendEventInput = {
  taskId: string
  workspaceId: string
  actorUserId: string
  type: TaskEventType
  payload: unknown
}

/**
 * Records one event. Never opens a transaction of its own: it runs inside the caller's, so the
 * event commits or rolls back together with the mutation it describes (spec 9.5).
 */
export async function appendEvent(q: Queryable, e: AppendEventInput): Promise<void> {
  if (COALESCING_TYPES.has(e.type) && (await coalesce(q, e))) return

  await q.insert(taskEvents).values({
    id: uuidv7(),
    taskId: e.taskId,
    workspaceId: e.workspaceId,
    actorUserId: e.actorUserId,
    type: e.type,
    payload: e.payload,
    occurredAt: sql`clock_timestamp()`,
  })
}

/**
 * Merges the event into the actor's latest event of the same type on the same task, if that one
 * is still inside the window. Returns whether a merge happened.
 *
 * This is the ONE place the log is updated rather than appended to (spec 9.2): without it every
 * autosave keystroke would become a row. The grouping key is (task_id, type, actor_user_id);
 * widening it would merge edits that are not the same edit. The merged payload keeps the
 * original `from` (it is only overlaid with the new `to`), so the event still describes the
 * whole edit.
 *
 * Concurrency: once a matching row exists, the FOR UPDATE subselect serialises concurrent
 * callers and the loser merges. When no row exists yet there is nothing to lock, so two
 * concurrent callers can each insert, giving two events instead of one merged one. That is
 * accepted: both are individually truthful and the app is effectively single-writer today. If it
 * must be exact, take pg_advisory_xact_lock(hashtext(task_id || type || actor_user_id)) first.
 */
async function coalesce(q: Queryable, e: AppendEventInput): Promise<boolean> {
  const windowSeconds = COALESCE_WINDOW_MS / 1000
  const incoming = JSON.stringify(e.payload)
  const result = await q.execute(sql`
    update task_events
    set payload = payload || jsonb_build_object('to', (${incoming}::jsonb) -> 'to'),
        occurred_at = clock_timestamp()
    where id = (
      select id from task_events
      where task_id = ${e.taskId}
        and type = ${e.type}
        and actor_user_id = ${e.actorUserId}
        and occurred_at > clock_timestamp() - make_interval(secs => ${windowSeconds})
      order by occurred_at desc
      limit 1
      for update
    )
    returning id
  `)
  return result.rows.length > 0
}
