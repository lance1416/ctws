import { FINISHED_TASK_STATUSES, type TaskStatus } from '@ctws/contracts'

const FINISHED: ReadonlySet<TaskStatus> = new Set(FINISHED_TASK_STATUSES)

export const isFinished = (s: TaskStatus) => FINISHED.has(s)

/**
 * A finished task brought back: to what it was before it was finished (BUG-095, 04-projects.md),
 * which `useTaskActions` finds out, the change log asked when this client did not see it go.
 */
export const REOPEN = 'reopen'

/** A status to set, or the one a finished task had before. */
export type StatusMove = TaskStatus | typeof REOPEN

/** Finish the task, or bring a finished one back as it was. */
export const toggleDoneTarget = (s: TaskStatus): StatusMove => (isFinished(s) ? REOPEN : 'done')

/**
 * What a finished task comes back to, from its change log (newest first): the status it left the
 * last time it was finished, if that was to do or in progress; to do otherwise, never the backlog.
 */
export function reopenedTo(
  changes: readonly { type: string; payload: unknown }[],
): Extract<TaskStatus, 'todo' | 'in_progress'> {
  for (const c of changes) {
    if (c.type !== 'status_changed') continue
    const { from, to } = (c.payload ?? {}) as { from?: TaskStatus; to?: TaskStatus }
    if (!to || !isFinished(to)) continue
    return from === 'in_progress' ? 'in_progress' : 'todo'
  }
  return 'todo'
}

/** Start, or stop. Stopping lands on `todo`, even if the task came from `backlog`. */
export const toggleStartTarget = (s: TaskStatus): TaskStatus =>
  s === 'in_progress' ? 'todo' : 'in_progress'
