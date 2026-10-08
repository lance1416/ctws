import { SEARCH_LIMIT } from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import type { Queryable } from '../db/client'
// The shell's, not this module's: a second module needed the same escaping (contract §3).
import { LIKE_ESCAPE as ESCAPE, likePattern } from '../db/like'
import type { Task } from './tasks'

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
 *     the exact complaint search is here to answer.
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
  const pattern = likePattern(query)
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
      and (
        t.title ilike ${pattern} escape ${ESCAPE}
        or (t.notes is not null and t.notes ilike ${pattern} escape ${ESCAPE})
      )
    order by
      case when t.title ilike ${pattern} escape ${ESCAPE} then 0 else 1 end,
      t.updated_at desc,
      t.id
    limit ${SEARCH_LIMIT}
  `)
  return (result.rows as Record<string, unknown>[]).map(rowToSearchTask)
}

const asDate = (v: unknown): Date | null =>
  v === null || v === undefined ? null : v instanceof Date ? v : new Date(v as string)

function rowToSearchTask(r: Record<string, unknown>): SearchTask {
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
    projectArchived: r.project_archived as boolean,
  }
}
