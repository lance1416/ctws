import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { rowsOf } from '../../platform/db/raw'
import { scoped } from '../../platform/db/scope'
import { events } from '../../shell/events'
import type { WeekCounts } from '../../shell/module'
import { readingItems } from './tables'

const counted = z.object({ finished: z.coerce.number().int() })

/**
 * The review's "Reading finished" (FR-081): items marked done in the week, once each, read from
 * their change log, and still here.
 */
export const readingWeekCounts: WeekCounts = async (q, workspaceId, window) => {
  const result = await q.execute(sql`
    select count(distinct ev.object_id) as finished
    from events ev
    join reading_items on reading_items.id = ev.object_id
    where ${scoped(events, workspaceId, 'ev')}
      and ${scoped(readingItems, workspaceId)}
      and ev.object_type = 'reading'
      and ev.type = 'field_changed'
      and ev.payload ->> 'field' = 'status'
      and ev.payload ->> 'to' = 'done'
      and ev.occurred_at >= ${window.from.toISOString()}::timestamptz
      and ev.occurred_at < ${window.to.toISOString()}::timestamptz
  `)
  return { readingFinished: rowsOf(result, counted)[0]!.finished }
}
