import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { rowsOf } from '../../platform/db/raw'
import { scoped } from '../../platform/db/scope'
import type { WeekCounts } from '../../shell/module'
import { communications } from './tables'

const counted = z.object({ sent: z.coerce.number().int(), received: z.coerce.number().int() })

/** The review's "Messages sent" and "Messages received" (FR-081), by when each happened. */
export const communicationWeekCounts: WeekCounts = async (q, workspaceId, window) => {
  const result = await q.execute(sql`
    select
      count(*) filter (where direction = 'sent') as sent,
      count(*) filter (where direction = 'received') as received
    from communications
    where ${scoped(communications, workspaceId)}
      and occurred_at >= ${window.from.toISOString()}::timestamptz
      and occurred_at < ${window.to.toISOString()}::timestamptz
  `)
  const [row] = rowsOf(result, counted)
  return { messagesSent: row!.sent, messagesReceived: row!.received }
}
