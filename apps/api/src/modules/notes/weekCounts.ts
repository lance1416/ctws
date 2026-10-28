import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { rowsOf } from '../../platform/db/raw'
import { scoped } from '../../platform/db/scope'
import type { WeekCounts } from '../../shell/module'
import { notes } from './tables'

const counted = z.object({ meetings: z.coerce.number().int() })

/**
 * The review's "With notes" (FR-081): the meetings held in the week that have a note hung on
 * them, each occurrence once however many it has.
 */
export const noteWeekCounts: WeekCounts = async (q, workspaceId, window) => {
  const result = await q.execute(sql`
    select count(distinct (anchor_id, occurrence_id)) as meetings
    from notes
    where ${scoped(notes, workspaceId)}
      and anchor_type = 'meeting'
      and occurrence_id is not null
      and held_at >= ${window.from.toISOString()}::timestamptz
      and held_at < ${window.to.toISOString()}::timestamptz
  `)
  return { meetingsWithNotes: rowsOf(result, counted)[0]!.meetings }
}
