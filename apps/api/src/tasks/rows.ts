import type { Task } from './tasks'

/**
 * A TASK AS A RAW ROW, mapped once.
 *
 * Three surfaces -- Today, Done and search -- read tasks through hand-written SQL rather than
 * drizzle's query builder, because each needs a join, a segment or a rank that the builder would
 * not express well. Each then mapped the SAME fifteen snake_case columns into the same object,
 * and each added one field of its own on the end. Three copies of a column list is three places
 * to forget when a column is added, and the kind of drift nothing catches: a missing field is
 * `undefined`, which serialises away silently.
 *
 * What differs stays with its surface. What is a task stays here.
 */

/** A `timestamptz` as the driver hands it back: already a Date, a string, or absent. */
export const asDate = (v: unknown): Date | null =>
  v === null || v === undefined ? null : v instanceof Date ? v : new Date(v as string)

/** Every column a task has, plus the two every one of these surfaces joins for. */
export type TaskRow = Task & { projectName: string; parentTitle: string | null }

export function taskRowOf(r: Record<string, unknown>): TaskRow {
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
  }
}
