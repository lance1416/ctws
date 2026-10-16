import { FINISHED_TASK_STATUSES, type TaskStatus } from '@ctws/contracts'

export const STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
  cancelled: 'Cancelled',
}

const FINISHED: ReadonlySet<TaskStatus> = new Set(FINISHED_TASK_STATUSES)

export const isFinished = (s: TaskStatus) => FINISHED.has(s)
