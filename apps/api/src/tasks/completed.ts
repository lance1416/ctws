import { sql } from 'drizzle-orm'
import type { Queryable } from '../db/client'
import type { Task } from './tasks'
import { taskRowOf } from './rows'

export type CompletedTask = Task & {
  projectName: string
  parentTitle: string | null
  /** The calendar day it was finished, in the user's timezone: the group the client shows it under. */
  completedOn: string
}

/**
 * Newest 200 finished tasks. No paging: this is a "what did I do lately" list, and the archive is
 * the weekly review, which takes any window and has no cap.
 *
 * ONE ROW MORE IS FETCHED THAN IS RETURNED, so the answer can say whether it is complete. A list
 * that silently stops at its own limit tells the reader their older work is gone.
 */
const COMPLETED_LIMIT = 200

/**
 * The cross-project "what did I finish" list, modelled on `listToday`: one query, workspace-scoped
 * through the project join, and the server decides both the order and the grouping.
 *
 *   - **Grouping is by the user's calendar day, not the server's.** `completed_on` is computed here
 *     in the account timezone; a task finished at 23:30 local must not appear under tomorrow
 *     because the database runs in UTC. The client only partitions by that field.
 *   - **Only `done`.** `completed_at` is set when a task becomes done and cleared when it leaves
 *     done, so it is exactly "currently finished". A cancelled task was not done work; it has no
 *     `completed_at` and is deliberately not here.
 *   - Archived projects still count (the work happened); deleted projects and tasks do not.
 */
export async function listCompleted(
  q: Queryable,
  workspaceId: string,
  timezone: string,
): Promise<{ tasks: CompletedTask[]; truncated: boolean }> {
  const result = await q.execute(sql`
    select
      t.id, t.project_id, t.parent_id, t.title, t.notes, t.status,
      t.scheduled_on::text as scheduled_on,
      t.due_at, t.rank, t.manual_progress, t.completed_at, t.deleted_at,
      t.created_at, t.updated_at,
      p.name as project_name,
      parent.title as parent_title,
      ((t.completed_at at time zone ${timezone})::date)::text as completed_on
    from tasks t
    join projects p on p.id = t.project_id
    left join tasks parent on parent.id = t.parent_id
    where p.workspace_id = ${workspaceId}
      and p.deleted_at is null
      and t.deleted_at is null
      and t.status = 'done'
      and t.completed_at is not null
    order by t.completed_at desc, t.id
    limit ${COMPLETED_LIMIT + 1}
  `)
  const rows = result.rows as Record<string, unknown>[]
  return {
    tasks: rows.slice(0, COMPLETED_LIMIT).map(rowToCompletedTask),
    truncated: rows.length > COMPLETED_LIMIT,
  }
}

function rowToCompletedTask(r: Record<string, unknown>): CompletedTask {
  return {
    ...taskRowOf(r),
    completedOn: r.completed_on as string,
  }
}
