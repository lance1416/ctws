import type { TaskStatus } from '@ctws/contracts'

/**
 * The five statuses, in words.
 *
 * A label table is not one surface's property: four components read it, and the pane's own status
 * control importing it from the pane would be a cycle.
 */
export const STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
  cancelled: 'Cancelled',
}
