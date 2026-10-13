import type { TaskStatus } from '@ctws/contracts'
import { sql, type SQL } from 'drizzle-orm'
import { ident } from '../../../platform/db/sql'
import type { Task } from '../tables'

/** Every task column, `scheduled_on` as text so node-postgres cannot shift it a day. */
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
      sql`${c('scheduled_on')}::text as scheduled_on`,
      c('due_at'),
      c('rank'),
      c('manual_progress'),
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

/** A `timestamptz` as a raw query returns it: a Date, a string, or absent. */
const asDate = (v: unknown): Date | null =>
  v === null || v === undefined ? null : v instanceof Date ? v : new Date(v as string)

export function taskRowOf(r: Record<string, unknown>): TaskRow {
  return {
    id: r.id as string,
    projectId: r.project_id as string,
    parentId: (r.parent_id as string | null) ?? null,
    title: r.title as string,
    notes: (r.notes as string | null) ?? null,
    status: r.status as TaskStatus,
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
  }
}
