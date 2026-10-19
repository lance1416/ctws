import type { TaskStatus } from '@ctws/contracts'

/**
 * The status of a task that has subtasks, worked out from theirs (FR-038). A parent is never set
 * by hand: "Amazon" is in progress because a step under it is, and done when every step is closed.
 *
 * In order, the first rule that holds:
 *   1. every child cancelled: cancelled;
 *   2. every child closed (done or cancelled) and at least one done: done;
 *   3. any child started or done, but not all closed: in progress;
 *   4. every child backlog: backlog;
 *   5. otherwise (nothing started): to do.
 *
 * `children` are the DIRECT children's statuses, each already derived where that child is itself
 * a parent, so the fold is one level at a time. An empty list is a leaf and has no derived status;
 * callers keep the leaf's own.
 */
export function derivedStatus(children: readonly TaskStatus[]): TaskStatus | null {
  if (children.length === 0) return null
  const count = (s: TaskStatus) => children.filter((c) => c === s).length
  const cancelled = count('cancelled')
  const done = count('done')
  if (cancelled === children.length) return 'cancelled'
  if (cancelled + done === children.length) return 'done'
  if (done > 0 || count('in_progress') > 0) return 'in_progress'
  if (count('backlog') === children.length) return 'backlog'
  return 'todo'
}
