import type { TaskId, TaskStatus } from '@ctws/contracts'
import { isFinished } from '../status'
import { flatten, type FlatRow } from './flatten'

/**
 * THE SIDEBAR'S OUTLINE OF A PROJECT (FR-020, artboard 8, P-01): its parents at every depth and its
 * own leaves, in the tree's order; a leaf under a parent is the page's to show. What is finished
 * (done or cancelled) goes, and everything under it, so a long-running project's outline holds
 * only what is still open.
 */
export function outlineRows(
  tasks: readonly { id: TaskId; parentId: TaskId | null; rank: string; status: TaskStatus }[],
): FlatRow[] {
  const finished = new Set(tasks.filter((t) => isFinished(t.status)).map((t) => t.id))
  // A finished one folded is a finished one hidden with all it holds.
  return flatten(tasks, finished).filter(
    (row) => (row.depth === 1 || row.hasChildren) && !finished.has(row.id),
  )
}
