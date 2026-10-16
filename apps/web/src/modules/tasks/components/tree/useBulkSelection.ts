import { type ProjectId, type TaskId } from '@ctws/contracts'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { refreshQueries } from '../../../../platform/http/refresh'
import { projectTasksQuery } from '../../api/queries'
import { moveTask, patchTask } from '../../api/tasks'

/**
 * The rows Shift+click has picked. Bulk actions go one request at a time and each id leaves the
 * selection as it succeeds, so after a failure what is still selected is what is left to do.
 */
export function useBulkSelection({
  projectId,
  visible,
  onFinished,
  onError,
}: {
  projectId: ProjectId
  /** The rows on screen now. A picked row that is folded, moved or deleted away is not picked. */
  visible: readonly TaskId[]
  /** Given the ids that really finished. */
  onFinished: (done: ReadonlySet<TaskId>) => void
  onError: (message: string) => void
}) {
  const qc = useQueryClient()
  const [picked, setSelected] = useState<ReadonlySet<TaskId>>(() => new Set())
  const onScreen = new Set(visible)
  const selected: ReadonlySet<TaskId> = new Set([...picked].filter((id) => onScreen.has(id)))
  const [busy, setBusy] = useState(false)

  const runOverSelection = async (
    act: (id: TaskId) => Promise<unknown>,
    settle?: (done: ReadonlySet<TaskId>) => void,
  ) => {
    setBusy(true)
    const done = new Set<TaskId>()
    try {
      for (const id of selected) {
        await act(id)
        done.add(id)
      }
    } catch (e) {
      const left = selected.size - done.size
      onError(`${e instanceof Error ? e.message : "That didn't work"} (${left} left undone)`)
    } finally {
      setSelected((prev) => new Set([...prev].filter((id) => onScreen.has(id) && !done.has(id))))
      setBusy(false)
      settle?.(done)
      await refreshQueries(qc, [projectTasksQuery(projectId).queryKey])
    }
  }

  return {
    selected,
    busy,
    toggle: (id: TaskId) =>
      setSelected((prev) => {
        const next = new Set([...prev].filter((p) => onScreen.has(p)))
        if (!next.delete(id)) next.add(id)
        return next
      }),
    clear: () => setSelected(new Set()),
    // The rows that really finished stay on screen, as a single one does.
    finish: () => runOverSelection((id) => patchTask(id, { status: 'done' }), onFinished),
    // To the other project's root: keeping a parent would mean moving the parent too.
    moveTo: (toProjectId: ProjectId) =>
      runOverSelection((id) => moveTask(id, { projectId: toProjectId, parentId: null })),
  }
}
