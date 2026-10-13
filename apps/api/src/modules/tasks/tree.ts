import type { Queryable } from '../../platform/db/client'
import { LOCKS, lockFor } from '../../platform/db/locks'

/** The deepest a task may sit; a root is at depth 1. */
export const MAX_DEPTH = 10

/**
 * Serialises changes to the shape of one workspace's tasks: create, move, delete and new
 * dependencies. Take it as the transaction's first statement: the cascades and the loop checks
 * read from their own snapshot, so a row written after that snapshot is never visited.
 */
export const lockTaskTree = (tx: Queryable, workspaceId: string): Promise<void> =>
  lockFor(tx, LOCKS.taskTree, workspaceId)
