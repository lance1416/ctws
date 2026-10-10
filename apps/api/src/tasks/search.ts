import { SEARCH_LIMIT } from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import type { Queryable } from '../db/client'
// The shell's, not this module's: a second module needed the same escaping (contract §3).
import { textMatches } from '../db/like'
import type { Task } from './tasks'
import { asDate, taskRowOf } from './rows'

export type SearchTask = Task & {
  projectName: string
  parentTitle: string | null
  projectArchived: boolean
}

/**
 * Cross-project search over titles and notes, modelled on `listToday` / `listCompleted`: one
 * query, workspace-scoped through the project join, and the server decides the order.
 *
 * What it deliberately does NOT exclude, because the point of search is to reach a task you
 * already know exists:
 *
 *   - **done and cancelled tasks are searched.** "What did I do / where did I get to" is half the
 *     reason this app exists, and every result carries its status, so a finished match is never
 *     mistaken for live work. Excluding them would make a remembered task unfindable, which is
 *     what search exists to prevent.
 *   - **archived projects are searched**, on the same reasoning the completed view uses: archiving
 *     sets a project aside, it does not deny the work. The result carries `projectArchived` so the
 *     client can say so instead of presenting it as current.
 *
 * What it excludes: soft-deleted tasks, and everything in a soft-deleted project. Those rows exist
 * only so the event log never points at nothing.
 *
 * Ordering puts title matches before notes-only matches -- someone typing a remembered name wants
 * the thing called that, not everything that mentions it -- then most recently touched first.
 */
export async function searchTasks(
  q: Queryable,
  workspaceId: string,
  query: string,
): Promise<SearchTask[]> {
  const result = await q.execute(sql`
    select
      t.id, t.project_id, t.parent_id, t.title, t.notes, t.status,
      t.scheduled_on::text as scheduled_on,
      t.due_at, t.rank, t.manual_progress, t.completed_at, t.deleted_at,
      t.created_at, t.updated_at,
      p.name as project_name,
      (p.archived_at is not null) as project_archived,
      parent.title as parent_title
    from tasks t
    join projects p on p.id = t.project_id
    left join tasks parent on parent.id = t.parent_id
    where p.workspace_id = ${workspaceId}
      and p.deleted_at is null
      and t.deleted_at is null
      and ${textMatches(['t.title', 't.notes'], query)}
    order by
      case when ${textMatches(['t.title'], query)} then 0 else 1 end,
      t.updated_at desc,
      t.id
    limit ${SEARCH_LIMIT}
  `)
  return (result.rows as Record<string, unknown>[]).map(rowToSearchTask)
}

function rowToSearchTask(r: Record<string, unknown>): SearchTask {
  return {
    ...taskRowOf(r),
    projectArchived: r.project_archived as boolean,
  }
}
