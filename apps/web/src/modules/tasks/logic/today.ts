import type { TodayTaskResponse } from '@ctws/contracts'

/** Today's rows by the segment the server put each in. A task is in exactly one. */
export function todaySegments(rows: readonly TodayTaskResponse[]) {
  return {
    inProgress: rows.filter((t) => t.segment === 'in_progress'),
    planned: rows.filter((t) => t.segment === 'today'),
    overdue: rows.filter((t) => t.segment === 'overdue'),
  }
}

/**
 * READY TO START, one list wherever it is shown (FR-041, v2.8): the leaves that could be started,
 * less those Today already lists as planned or overdue, so the workbench and Today say one number.
 */
export function offeredReady<T extends { id: string }>(
  ready: readonly T[],
  today: readonly { id: string }[],
): T[] {
  const listed = new Set(today.map((t) => t.id))
  return ready.filter((t) => !listed.has(t.id))
}
