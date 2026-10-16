import { problemText } from '../../../../platform/http/api'
import { MAX_TASK_DEPTH, type ProjectId, type TaskId } from '@ctws/contracts'
import { useRef, useState } from 'react'
import { useRefresh } from '../../../../shell/registry'
import { createTask, taskKeys } from '../../api'
import type { FlatRow } from '../../logic/tree/flatten'

/**
 * The inline new row, at the end of a parent's children, where the server appends. A refusal with
 * no row to sit beside goes to the tree's banner through `onRefuse`.
 */
export function useInlineAdd({
  projectId,
  unfold,
  onRefuse,
  focus,
}: {
  projectId: ProjectId
  unfold: (ids: readonly TaskId[]) => void
  onRefuse: (message: string | null) => void
  /** Puts focus on a row's handle. */
  focus: (id: TaskId) => void
}) {
  const refresh = useRefresh()
  // The parent whose children it appends to (null: the root level), and the row whose handle
  // takes focus back when it is cancelled.
  const [adding, setAdding] = useState<{ parentId: TaskId | null; from: TaskId } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)

  /** Opens the input, unfolding the parent first so it, and what it creates, is on screen. */
  const start = (parentId: TaskId | null, from: TaskId) => {
    if (parentId) unfold([parentId])
    onRefuse(null)
    setError(null)
    setAdding({ parentId, from })
  }

  const addChild = (row: FlatRow) => {
    if (row.depth >= MAX_TASK_DEPTH) onRefuse('Too deep to add a subtask here')
    else start(row.id, row.id)
  }

  const commit = async (title: string) => {
    if (!adding || inFlight.current) return false
    inFlight.current = true
    try {
      await createTask({ projectId, title, parentId: adding.parentId })
      // Only this list is waited for: the next Enter must not wait on unrelated refetches.
      await refresh(['task'], [taskKeys.list(projectId)])
      setError(null)
      return true
    } catch (e) {
      setError(problemText(e) ?? "Couldn't create. Press Enter to try again.")
      return false
    } finally {
      inFlight.current = false
    }
  }

  const cancel = (restoreFocus: boolean) => {
    const from = adding?.from
    setAdding(null)
    if (restoreFocus && from) queueMicrotask(() => focus(from))
  }

  return { adding, error, start, addChild, commit, cancel }
}
