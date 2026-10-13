import { TASK_EVENTS_PAGE, type TaskEventResponse, type TaskEventType } from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import type { Queryable } from '../../../platform/db/client'
import { InvalidCursorError } from '../errors'
import { visibleTask } from './scope'

// The cursor keeps the timestamp as Postgres text: a JS Date would drop the microseconds and the
// next page would skip or repeat rows.
const CURSOR_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/
const CURSOR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

function encodeCursor(ts: string, id: string): string {
  return Buffer.from(`${ts}|${id}`, 'utf8').toString('base64url')
}

function decodeCursor(cursor: string): { ts: string; id: string } {
  // Re-encoding catches the stray characters Buffer.from tolerates.
  const decoded = Buffer.from(cursor, 'base64url')
  if (decoded.toString('base64url') !== cursor) throw new InvalidCursorError()
  const [ts, id, ...rest] = decoded.toString('utf8').split('|')
  if (rest.length > 0 || !ts || !id || !CURSOR_TS.test(ts) || !CURSOR_ID.test(id)) {
    throw new InvalidCursorError()
  }
  return { ts, id }
}

type EventRow = {
  id: string
  task_id: string
  actor_user_id: string
  type: TaskEventType
  payload: Record<string, unknown>
  source: string
  ts: string
}

/**
 * A visible task's history, newest first. Keyset paging on (occurred_at, id), since events keep
 * arriving; one extra row says whether another page exists.
 */
export async function listTaskEvents(
  q: Queryable,
  workspaceId: string,
  taskId: string,
  opts: { cursor?: string | undefined; limit?: number } = {},
): Promise<{ events: TaskEventResponse[]; nextCursor: string | null }> {
  const limit = opts.limit ?? TASK_EVENTS_PAGE.default
  const after = opts.cursor === undefined ? null : decodeCursor(opts.cursor)
  await visibleTask(q, workspaceId, taskId)

  const result = await q.execute(sql`
    select id, task_id, actor_user_id, type, payload, source,
           to_char(occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as ts
    from task_events
    where task_id = ${taskId}
      ${after ? sql`and (occurred_at, id) < (${after.ts}::timestamptz, ${after.id}::uuid)` : sql``}
    order by occurred_at desc, id desc
    limit ${limit + 1}
  `)
  const rows = result.rows as EventRow[]
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
