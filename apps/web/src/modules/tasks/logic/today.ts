import type { TodayTaskResponse } from '@ctws/contracts'

/** Today's rows by the segment the server put each in. A task is in exactly one. */
export function todaySegments(rows: readonly TodayTaskResponse[]) {
  return {
    inProgress: rows.filter((t) => t.segment === 'in_progress'),
    planned: rows.filter((t) => t.segment === 'today'),
    overdue: rows.filter((t) => t.segment === 'overdue'),
  }
}
