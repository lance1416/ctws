import { problemText } from '../../../../platform/http/api'
import { type DragEndEvent } from '@dnd-kit/core'
import { type ProjectId, type TaskId, type TaskPosition } from '@ctws/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { moveTask, type ProjectTasks, projectTasksQuery } from '../../api'
import { applyMove } from '../../logic/tree/applyMove'
import { planDrop } from '../../logic/tree/drop'
import type { FlatRow } from '../../logic/tree/flatten'
import { INDENT_PX } from '../TaskRowParts'
import type { useCollapsed } from './useCollapsed'

/**
 * Moving rows, by drag or by key: the plan is checked here, the cache moves at once, and a
 * refusal puts it back and says why through `onError`.
 */
export function useTreeMove({
  projectId,
  rows,
  folds,
  onError,
}: {
  projectId: ProjectId
  rows: FlatRow<TaskId>[]
  folds: Pick<ReturnType<typeof useCollapsed>, 'collapsed' | 'fold' | 'unfold'>
  /** Why a move was refused, or null when one goes ahead. */
  onError: (message: string | null) => void
}) {
  const qc = useQueryClient()
  const key = projectTasksQuery(projectId).queryKey
  const move = useMutation({
    mutationFn: ({ id, body }: { id: TaskId; body: TaskPosition; unfolded?: TaskId }) =>
      moveTask(id, body),
    onMutate: async ({ id, body, unfolded }) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<ProjectTasks>(key)
      // Only the rows move; the rollups are the server's arithmetic and wait for the refetch.
      qc.setQueryData<ProjectTasks>(key, (old) =>
        old ? { ...old, tasks: applyMove(old.tasks, id, body) } : old,
      )
      return { previous, unfolded }
    },
    onError: (e, _vars, context) => {
      // Back to what the database holds, and the parent the drop unfolded folds again.
      if (context?.previous) qc.setQueryData(key, context.previous)
      if (context?.unfolded) folds.fold(context.unfolded)
      onError(problemText(e) ?? "Couldn't move it")
    },
    meta: { awaits: [key], ownsError: true },
  })

  /** Drops `draggedId` at `slot` at `wantedDepth`, if the plan allows it. */
  const run = (draggedId: TaskId, slot: number, wantedDepth: number) => {
    if (slot < 0 || slot > rows.length) return
    const plan = planDrop({ rows, draggedId, slot, wantedDepth })
    if (!plan.ok) {
      if (plan.reason === 'own-subtree') onError('A task cannot move inside itself')
      else if (plan.reason === 'too-deep') onError('Too deep to move it there')
      return
    }
    onError(null)
    // A row moved under a folded parent would vanish while sitting in the database, so the
    // parent opens; which one travels with the move, so a refusal can fold it again.
    let unfolded: TaskId | undefined
    if (plan.parentId && folds.collapsed.has(plan.parentId)) {
      folds.unfold([plan.parentId])
      unfolded = plan.parentId
    }
    const body: TaskPosition = { projectId, parentId: plan.parentId }
    if (plan.beforeId) body.beforeId = plan.beforeId
    if (plan.afterId) body.afterId = plan.afterId
    move.mutate({ id: draggedId, body, ...(unfolded ? { unfolded } : {}) })
  }

  /** How many rows the row at `index` and its visible subtree take. */
  const blockLength = (index: number) => {
    let end = index + 1
    while (end < rows.length && rows[end]!.depth > rows[index]!.depth) end++
    return end - index
  }

  const onDragEnd = ({ active, over, delta }: DragEndEvent) => {
    const from = rows.findIndex((r) => r.id === active.id)
    const overIndex = over ? rows.findIndex((r) => r.id === over.id) : -1
    if (from < 0 || overIndex < 0) return
    // Dropping below the target lands after its whole visible block, not inside it.
    const slot = overIndex > from ? overIndex + blockLength(overIndex) : overIndex
    run(rows[from]!.id, slot, rows[from]!.depth + Math.round(delta.x / INDENT_PX))
  }

  return { run, blockLength, onDragEnd }
}
