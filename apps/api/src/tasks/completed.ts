import { sql } from 'drizzle-orm'
import type { Queryable } from '../db/client'
import type { Task } from './tasks'

export type CompletedTask = Task & {
  projectName: string
  parentTitle: string | null
  /** The calendar day it was finished, in the user's timezone: the group the client shows it under. */
  completedOn: string
}

/** Newest 200 finished tasks. No paging: this is a "what did I do lately" list, not an archive. */
export const COMPLETED_LIMIT = 200

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
): Promise<CompletedTask[]> {
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
    limit ${COMPLETED_LIMIT}
  `)
  return (result.rows as Record<string, unknown>[]).map(rowToCompletedTask)
}

const asDate = (v: unknown): Date | null =>
  v === null || v === undefined ? null : v instanceof Date ? v : new Date(v as string)

function rowToCompletedTask(r: Record<string, unknown>): CompletedTask {
  return {
    id: r.id as string,
    projectId: r.project_id as string,
    parentId: (r.parent_id as string | null) ?? null,
    title: r.title as string,
    notes: (r.notes as string | null) ?? null,
    status: r.status as string,
    scheduledOn: (r.scheduled_on as string | null) ?? null,
    dueAt: asDate(r.due_at),
    rank: r.rank as string,
    manualProgress: (r.manual_progress as string | null) ?? null,
    completedAt: asDate(r.completed_at),
    deletedAt: asDate(r.deleted_at),
    createdAt: asDate(r.created_at)!,
    updatedAt: asDate(r.updated_at)!,
    projectName: r.project_name as string,
    parentTitle: (r.parent_title as string | null) ?? null,
    completedOn: r.completed_on as string,
  }
}
