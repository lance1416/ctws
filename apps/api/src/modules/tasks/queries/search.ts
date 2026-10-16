import { SEARCH_LIMIT, type WorkspaceId } from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import type { Queryable } from '../../../platform/db/client'
import { textMatches } from '../../../platform/db/sql'
import { TASK_COLUMNS, taskRowOf, type TaskRow } from './rows'
import { taskVisibleSql } from './scope'

export type SearchTask = TaskRow & { projectArchived: boolean }

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
      ${TASK_COLUMNS('t')},
      p.name as project_name,
      (p.archived_at is not null) as project_archived,
      parent.title as parent_title
    from tasks t
    join projects p on p.id = t.project_id
    left join tasks parent on parent.id = t.parent_id
    where ${taskVisibleSql('t', 'p', workspaceId)}
      and ${textMatches(['t.title', 't.notes'], query)}
    order by
      case when ${textMatches(['t.title'], query)} then 0 else 1 end,
      t.updated_at desc,
      t.id
    limit ${SEARCH_LIMIT}
  `)
  return (result.rows as Record<string, unknown>[]).map((r) => ({
    ...taskRowOf(r),
    projectArchived: r.project_archived as boolean,
  }))
}
