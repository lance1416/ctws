import { FINISHED_TASK_STATUSES, type TaskStatus } from '@ctws/contracts'

const FINISHED: ReadonlySet<TaskStatus> = new Set(FINISHED_TASK_STATUSES)

export const isFinished = (s: TaskStatus) => FINISHED.has(s)

/**
 * Finish the task, or bring a finished one back. It comes back to `backlog`, not its earlier
 * status, which only the event log knows.
 */
export const toggleDoneTarget = (s: TaskStatus): TaskStatus => (isFinished(s) ? 'backlog' : 'done')

/** Start, or stop. Stopping lands on `todo`, even if the task came from `backlog`. */
export const toggleStartTarget = (s: TaskStatus): TaskStatus =>
  s === 'in_progress' ? 'todo' : 'in_progress'
