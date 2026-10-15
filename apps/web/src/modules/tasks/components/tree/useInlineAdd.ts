import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { refreshQueries } from '../../../../platform/http/refresh'
import { projectTasksQuery } from '../../api/queries'
import { createTask } from '../../api/tasks'
import type { FlatRow } from '../../tree/flatten'
import { MAX_DEPTH } from '../../tree/drop'

/**
 * THE INLINE NEW ROW: where it shows (the end of a parent's children, which is where the server
 * appends), what it creates, and where focus goes when it is cancelled.
 *
 * Its failure is said next to the input (`error`); a refusal that has no row to sit beside --
 * too deep -- goes to the tree's banner through `onRefuse`.
 */
export function useInlineAdd({
  projectId,
  unfold,
  onRefuse,
}: {
  projectId: string
  unfold: (ids: readonly string[]) => void
  onRefuse: (message: string | null) => void
}) {
  const qc = useQueryClient()
  // The parent whose children it appends to (null: the root level), and the row whose handle
  // takes focus back when it is cancelled.
  const [adding, setAdding] = useState<{ parentId: string | null; from: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)

  /** Opens the input, unfolding the parent first so it, and what it creates, is on screen. */
  const start = (parentId: string | null, from: string) => {
    if (parentId) unfold([parentId])
    onRefuse(null)
    setError(null)
    setAdding({ parentId, from })
  }

  const addChild = (row: FlatRow) => {
    if (row.depth >= MAX_DEPTH) onRefuse('Too deep to add a subtask here')
    else start(row.id, row.id)
  }

  const commit = async (title: string) => {
    if (!adding || inFlight.current) return false
    inFlight.current = true
    try {
      await createTask({ projectId, title, parentId: adding.parentId })
      // Only this list is waited for: the next Enter must not wait on unrelated refetches.
      await refreshQueries(qc, [projectTasksQuery(projectId).queryKey])
      setError(null)
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create. Press Enter to try again.")
      return false
    } finally {
      inFlight.current = false
    }
  }

  const cancel = (restoreFocus: boolean) => {
    const from = adding?.from
    setAdding(null)
    if (restoreFocus && from)
      queueMicrotask(() =>
        document.querySelector<HTMLElement>(`[data-handle-id="${from}"]`)?.focus(),
      )
  }

  return { adding, error, start, addChild, commit, cancel }
}
