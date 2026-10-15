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
  onFinished,
  onError,
}: {
  projectId: string
  /** Given the ids that really finished. */
  onFinished: (done: ReadonlySet<string>) => void
  onError: (message: string) => void
}) {
  const qc = useQueryClient()
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())
  const [busy, setBusy] = useState(false)

  const runOverSelection = async (
    act: (id: string) => Promise<unknown>,
    settle?: (done: ReadonlySet<string>) => void,
  ) => {
    setBusy(true)
    const done = new Set<string>()
    try {
      for (const id of selected) {
        await act(id)
        done.add(id)
      }
    } catch (e) {
      const left = selected.size - done.size
      onError(`${e instanceof Error ? e.message : "That didn't work"} (${left} left undone)`)
    } finally {
      setSelected((prev) => new Set([...prev].filter((id) => !done.has(id))))
      setBusy(false)
      settle?.(done)
      await refreshQueries(qc, [projectTasksQuery(projectId).queryKey])
    }
  }

  return {
    selected,
    busy,
    toggle: (id: string) =>
      setSelected((prev) => {
        const next = new Set(prev)
        if (!next.delete(id)) next.add(id)
        return next
      }),
    clear: () => setSelected(new Set()),
    // The rows that really finished stay on screen, as a single one does.
    finish: () => runOverSelection((id) => patchTask(id, { status: 'done' }), onFinished),
    // To the other project's root: keeping a parent would mean moving the parent too.
    moveTo: (toProjectId: string) =>
      runOverSelection((id) => moveTask(id, { projectId: toProjectId, parentId: null })),
  }
}
