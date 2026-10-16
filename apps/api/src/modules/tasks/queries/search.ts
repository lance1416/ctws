import { SEARCH_LIMIT, type WorkspaceId } from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Queryable } from '../../../platform/db/client'
import { rowsOf } from '../../../platform/db/raw'
import { textMatches } from '../../../platform/db/sql'
import { TASK_COLUMNS, taskRow } from './rows'
import { visibleTasks } from './scope'

const searchRow = taskRow.extend({ projectArchived: z.boolean() })
export type SearchTask = z.output<typeof searchRow>

/**
 * Tasks whose title or notes match, finished ones and archived projects included; title matches
 * first, then the most recently touched.
 */
export async function searchTasks(
  q: Queryable,
  workspaceId: WorkspaceId,
  query: string,
): Promise<SearchTask[]> {
  const result = await q.execute(sql`
    select
      ${TASK_COLUMNS},
      p.name as "projectName",
      (p.archived_at is not null) as "projectArchived",
      parent.title as "parentTitle"
    from tasks t
    join projects p on p.id = t.project_id
    left join tasks parent on parent.id = t.parent_id
    where ${visibleTasks(workspaceId, { task: 't', project: 'p' })}
      and ${textMatches(['t.title', 't.notes'], query)}
    order by
      case when ${textMatches(['t.title'], query)} then 0 else 1 end,
      t.updated_at desc,
      t.id
    limit ${SEARCH_LIMIT}
  `)
  return rowsOf(result, searchRow)
}
