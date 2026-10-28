import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { rowsOf } from '../../platform/db/raw'
import { scoped } from '../../platform/db/scope'
import type { WeekCounts } from '../../shell/module'
import { people } from './tables'

const counted = z.object({ added: z.coerce.number().int() })

/** The review's "People added" (FR-081): people made in the week who are still here. */
export const peopleWeekCounts: WeekCounts = async (q, workspaceId, window) => {
  const result = await q.execute(sql`
    select count(*) as added from people
    where ${scoped(people, workspaceId)}
      and created_at >= ${window.from.toISOString()}::timestamptz
      and created_at < ${window.to.toISOString()}::timestamptz
  `)
  return { peopleAdded: rowsOf(result, counted)[0]!.added }
}
