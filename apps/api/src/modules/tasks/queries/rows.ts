import type { ProjectId, TaskId, TaskStatus } from '@ctws/contracts'
import { sql, type SQL } from 'drizzle-orm'
import { ident } from '../../../platform/db/sql'
import type { Task } from '../tables'

/** Every task column. */
export const TASK_COLUMNS = (t: string): SQL => {
  const c = (name: string) => sql`${ident(t)}.${ident(name)}`
  return sql.join(
    [
      c('id'),
      c('project_id'),
      c('parent_id'),
      c('title'),
      c('notes'),
      c('status'),
      c('scheduled_on'),
      c('due_at'),
      c('rank'),
      c('completed_at'),
      c('deleted_at'),
      c('created_at'),
      c('updated_at'),
    ],
    sql`, `,
  )
}

/** A task read by raw SQL with its project and parent named. */
export type TaskRow = Task & { projectName: string; parentTitle: string | null }

/** A `timestamptz` as drizzle's raw `execute` returns it: the text Postgres sent, or null. */
const asDate = (v: unknown): Date | null => (v === null ? null : new Date(v as string))

export function taskRowOf(r: Record<string, unknown>): TaskRow {
  return {
    id: r.id as TaskId,
    projectId: r.project_id as ProjectId,
    parentId: (r.parent_id as TaskId | null) ?? null,
    title: r.title as string,
    notes: (r.notes as string | null) ?? null,
    status: r.status as TaskStatus,
    scheduledOn: r.scheduled_on as string | null,
    dueAt: asDate(r.due_at),
    rank: r.rank as string,
    completedAt: asDate(r.completed_at),
    deletedAt: asDate(r.deleted_at),
    createdAt: asDate(r.created_at)!,
    updatedAt: asDate(r.updated_at)!,
    projectName: r.project_name as string,
    parentTitle: (r.parent_title as string | null) ?? null,
  }
}
