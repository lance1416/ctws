import type { TaskStatus } from '@ctws/contracts'

/**
 * The five statuses, in words.
 *
 * It lived in the detail pane and moved here when a fourth component needed it -- and, more to
 * the point, when the pane's own status control started importing it, which would have been a
 * cycle. A label table is not one surface's property.
 */
export const STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: '待整理',
  todo: '待办',
  in_progress: '进行中',
  done: '已完成',
  cancelled: '已取消',
}
