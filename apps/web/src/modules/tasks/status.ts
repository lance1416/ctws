import type { TaskStatus } from '@ctws/contracts'

/** The five statuses, in words. */
export const STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
  cancelled: 'Cancelled',
}

/** Settled: nothing more will be done on it. */
export const isFinished = (s: TaskStatus) => s === 'done' || s === 'cancelled'
