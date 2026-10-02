import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { MoveTaskBody, TaskResponse } from '@ctws/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, type KeyboardEvent } from 'react'
import { listProjectTasks, moveTask } from '../api/tasks'
import { flatten } from '../tree/flatten'
import { loadCollapsed, saveCollapsed } from '../tree/collapse'
import { planDrop, type DropPlan } from '../tree/drop'
import { TaskRow } from './TaskRow'

const INDENT_PX = 20

/**
 * Optimistic result of a move. The server computes the real rank (spec 8.3), so this only has to
 * put the row where the user dropped it until the refetch replaces it: the siblings of the new
 * parent get stand-in ranks that follow the intended order. They are never sent anywhere.
 */
function applyMove(old: TaskResponse[], id: string, body: MoveTaskBody): TaskResponse[] {
  const moved = old.find((t) => t.id === id)
  if (!moved) return old
  const siblings = old
    .filter((t) => t.parentId === body.parentId && t.id !== id)
    .sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : a.id < b.id ? -1 : 1))
  let at = siblings.length
  if (body.beforeId)
    at = Math.max(
      siblings.findIndex((t) => t.id === body.beforeId),
      0,
    )
  else if (body.afterId) at = siblings.findIndex((t) => t.id === body.afterId) + 1
  const ordered = [...siblings.slice(0, at), moved, ...siblings.slice(at)]
  const rankOf = new Map(ordered.map((t, i) => [t.id, String(i).padStart(8, '0')]))
  return old.map((t) =>
    t.id === id
      ? { ...t, parentId: body.parentId, rank: rankOf.get(id)! }
      : rankOf.has(t.id)
        ? { ...t, rank: rankOf.get(t.id)! }
        : t,
  )
}

export function TaskTree({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const key = ['tasks', projectId]
  const [collapsed, setCollapsed] = useState(() => loadCollapsed(projectId))
  const [error, setError] = useState<string | null>(null)

  // The cache holds exactly what listProjectTasks returns; the rows are derived, never cached.
  const tasks = useQuery({ queryKey: key, queryFn: () => listProjectTasks(projectId) })
  const rows = useMemo(() => flatten(tasks.data ?? [], collapsed), [tasks.data, collapsed])
  const titles = useMemo(
    () => new Map((tasks.data ?? []).map((t) => [t.id, t.title])),
    [tasks.data],
  )

  // Distance, so a plain click on the handle (to focus it) is not mistaken for a drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const move = useMutation({
    mutationFn: ({ id, body }: { id: string; body: MoveTaskBody }) => moveTask(id, body),
    onMutate: async ({ id, body }) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<TaskResponse[]>(key)
      qc.setQueryData<TaskResponse[]>(key, (old) => applyMove(old ?? [], id, body))
      return { previous }
    },
    onError: (error, _vars, context) => {
      // Without this the UI keeps a state the database does not contain, and the user believes
      // the move succeeded until the next reload. See Review Focus 5.
      if (context?.previous) qc.setQueryData(key, context.previous)
      setError(error instanceof Error ? error.message : '移动失败')
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })

  const run = (draggedId: string, slot: number, wantedDepth: number) => {
    if (slot < 0 || slot > rows.length) return
    const plan: DropPlan = planDrop({ rows, draggedId, slot, wantedDepth })
    // A refused plan means do nothing: never send a move the plan refused.
    if (!plan.ok) {
      if (plan.reason === 'own-subtree') setError('不能把任务移到它自己的子任务里')
      else if (plan.reason === 'too-deep') setError('层级太深，无法移到那里')
      return
    }
    setError(null)
    const body: MoveTaskBody = { projectId, parentId: plan.parentId }
    if (plan.beforeId) body.beforeId = plan.beforeId
    if (plan.afterId) body.afterId = plan.afterId
    move.mutate({ id: draggedId, body })
  }

  const blockLength = (index: number) => {
    let end = index + 1
    while (end < rows.length && rows[end]!.depth > rows[index]!.depth) end++
    return end - index
  }

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const row = rows[index]!
    if (e.altKey && e.key === 'ArrowUp') {
      e.preventDefault()
      // Step over the previous sibling's whole visible block. Landing at index - 1 would put the
      // slot inside an expanded subtree above, and the lower depth clamp would drag the row
      // into it as that subtree's first child.
      let j = index - 1
      while (j > 0 && rows[j]!.depth > row.depth) j--
      run(row.id, j, row.depth)
    } else if (e.altKey && e.key === 'ArrowDown') {
      e.preventDefault()
      // Mirror of Alt+Up and of the pointer drag: land after the next row's whole visible
      // block, not between it and its first child.
      const next = index + blockLength(index)
      if (next < rows.length) run(row.id, next + blockLength(next), row.depth)
    } else if (e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      // Indent / outdent. Alt+arrows rather than Tab: Tab must keep leaving the tree, or the
      // tree is a keyboard trap (WCAG 2.1.2).
      e.preventDefault()
      run(row.id, index, row.depth + (e.key === 'ArrowRight' ? 1 : -1))
    }
  }

  const onDragEnd = ({ active, over, delta }: DragEndEvent) => {
    const from = rows.findIndex((r) => r.id === active.id)
    const overIndex = over ? rows.findIndex((r) => r.id === over.id) : -1
    if (from < 0 || overIndex < 0) return
    // Dropping below the target lands after its whole visible block, not inside it.
    const slot = overIndex > from ? overIndex + blockLength(overIndex) : overIndex
    run(rows[from]!.id, slot, rows[from]!.depth + Math.round(delta.x / INDENT_PX))
  }

  const toggle = (id: string) => {
    const next = new Set(collapsed)
    if (!next.delete(id)) next.add(id)
    setCollapsed(next)
    saveCollapsed(projectId, next)
  }

  return (
    <>
      {tasks.isError && (
        <p role="alert" className="mt-4 text-danger">
          任务加载失败
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-danger">
          {error}
        </p>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
          <ul className="mt-4 flex flex-col">
            {rows.map((row, i) => (
              <TaskRow
                key={row.id}
                row={row}
                title={titles.get(row.id) ?? ''}
                onToggle={() => toggle(row.id)}
                onKeyDown={(e) => onKeyDown(e, i)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </>
  )
}
