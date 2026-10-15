import type { TaskStatus } from '@ctws/contracts'

export const STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
  cancelled: 'Cancelled',
}

export const isFinished = (s: TaskStatus) => s === 'done' || s === 'cancelled'
