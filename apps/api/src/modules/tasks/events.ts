import type { TaskEventResponse, TaskEventType } from '@ctws/contracts'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import type { Queryable } from '../../platform/db/client'
import { projects } from '../../shell/projects/tables'
import { taskEvents, tasks } from './tables'
import { visibleProjects } from '../../shell/projects/store'
import { TaskNotFoundError } from './errors'

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

export const DEFAULT_EVENT_LIMIT = 50
export const MAX_EVENT_LIMIT = 100

export class InvalidCursorError extends Error {
  constructor() {
    super('Invalid cursor')
    this.name = 'InvalidCursorError'
  }
}

// Postgres timestamps carry microseconds but a JS Date only milliseconds, so the cursor holds the
// timestamp as text straight from the database. Round-tripping through Date would truncate it and
// make the row comparison skip or repeat rows that differ only below the millisecond.
const CURSOR_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/
const CURSOR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

function encodeCursor(ts: string, id: string): string {
  return Buffer.from(`${ts}|${id}`, 'utf8').toString('base64url')
}

function decodeCursor(cursor: string): { ts: string; id: string } {
  // Buffer.from is lenient about stray characters, so re-encode and compare to reject anything
  // that is not exactly what encodeCursor would have produced.
  const decoded = Buffer.from(cursor, 'base64url')
  if (decoded.toString('base64url') !== cursor) throw new InvalidCursorError()
  const [ts, id, ...rest] = decoded.toString('utf8').split('|')
  if (rest.length > 0 || !ts || !id || !CURSOR_TS.test(ts) || !CURSOR_ID.test(id)) {
    throw new InvalidCursorError()
  }
  return { ts, id }
}

/**
 * A task's history, newest first, one page at a time.
 *
 * Per-task history deliberately follows task visibility: a soft-deleted task, or one in another
 * workspace, is a 404 here like on every other read path. History is not lost -- the
 * workspace-wide event scan (M3) is where a deleted task's events stay reachable.
 *
 * Paging is keyset, not offset, because events keep arriving. The cursor is the last row's
 * (occurred_at, id) and the next page is a ROW comparison against it. Comparing occurred_at alone
 * would drop or repeat rows whenever two events share a timestamp; id is the tiebreaker.
 * limit + 1 rows are fetched so "is there more" is known rather than guessed: guessing from
 * rows.length === limit hands out a cursor to an empty page when the count is an exact multiple.
 */
export async function listTaskEvents(
  q: Queryable,
  workspaceId: string,
  taskId: string,
  opts: { cursor?: string | undefined; limit?: number } = {},
): Promise<{ events: TaskEventResponse[]; nextCursor: string | null }> {
  const limit = opts.limit ?? DEFAULT_EVENT_LIMIT
  const after = opts.cursor === undefined ? null : decodeCursor(opts.cursor)

  // Same predicate as lockVisibleTask (scoped through projects), without the row lock.
  const [visible] = await q
    .select({ id: tasks.id })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(eq(tasks.id, taskId), isNull(tasks.deletedAt), visibleProjects(workspaceId)))
  if (!visible) throw new TaskNotFoundError()

  const result = await q.execute(sql`
    select id, task_id, actor_user_id, type, payload, source,
           to_char(occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as ts
    from task_events
    where task_id = ${taskId}
      ${after ? sql`and (occurred_at, id) < (${after.ts}::timestamptz, ${after.id}::uuid)` : sql``}
    order by occurred_at desc, id desc
    limit ${limit + 1}
  `)
  const rows = result.rows as {
    id: string
    task_id: string
    actor_user_id: string
    type: TaskEventType
    payload: Record<string, unknown>
    source: string
    ts: string
  }[]

  const page = rows.slice(0, limit)
  const last = page[page.length - 1]
  return {
    events: page.map((r) => ({
      id: r.id,
      taskId: r.task_id,
      actorUserId: r.actor_user_id,
      type: r.type,
      payload: r.payload,
      source: r.source,
      occurredAt: new Date(r.ts).toISOString(),
    })),
    nextCursor: rows.length > limit && last ? encodeCursor(last.ts, last.id) : null,
  }
}
