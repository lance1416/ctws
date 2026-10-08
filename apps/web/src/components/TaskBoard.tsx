import type { TaskResponse, TaskStatus } from '@ctws/contracts'
import {
  DndContext,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { listProjectTasks } from '../api/tasks'
import { tasksKey } from '../api/taskCache'
import { useTaskActions } from '../api/taskActions'
import { PanelEmpty } from './Panel'
import { STATUS_LABEL } from './statusLabel'

/**
 * THE BOARD: the task block's second view (design spec §2's third v1 view, and the first user of
 * the block-header tabs).
 *
 * IT IS NOT A SECOND PAGE. A board is another way to look at the block that is already on the
 * project page, which is how Notion's databases and Linear's issue lists carry their views. That
 * is also why it has no route of its own and no row in the rail: adding a third view later costs
 * one entry in the module's `views`.
 *
 * IT IS FLAT, AND THAT IS THE POINT. The tree answers 「这件事由哪些小事组成」; the board answers
 * 「什么卡在哪一步」, and nesting cannot be drawn in a column without turning it back into a tree.
 * Every task appears exactly once, under its own status, with its parent named beneath it so a
 * card is never orphaned from the work it belongs to.
 */

/** Left to right in the status model's own order; `cancelled` is not a step of the work. */
const COLUMNS: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'done']

function Card({ task, parentTitle }: { task: TaskResponse; parentTitle: string | null }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id })
  return (
    <li>
      <button
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        type="button"
        data-board-card={task.id}
        className={`w-full rounded-lg border border-border-subtle bg-surface px-2.5 py-2 text-left hover:border-border-strong ${
          isDragging ? 'opacity-40' : ''
        }`}
      >
        <span className="block text-sm text-fg">{task.title}</span>
        {parentTitle && (
          <span className="mt-0.5 block truncate text-xs text-fg-subtle">{parentTitle}</span>
        )}
      </button>
    </li>
  )
}

function Column({
  status,
  tasks,
  parentOf,
}: {
  status: TaskStatus
  tasks: TaskResponse[]
  parentOf: (t: TaskResponse) => string | null
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  return (
    <section
      ref={setNodeRef}
      aria-label={STATUS_LABEL[status]}
      data-board-column={status}
      className={`flex min-w-0 flex-col rounded-xl p-2 ${
        isOver ? 'bg-surface-hover' : 'bg-surface-sunken'
      }`}
    >
      <h3 className="flex items-baseline gap-2 px-1 pb-1.5 text-sm font-semibold text-fg-muted">
        {STATUS_LABEL[status]}
        {tasks.length > 0 && (
          <span data-count className="text-xs text-fg-subtle tabular-nums">
            {tasks.length}
          </span>
        )}
      </h3>
      <ul className="flex min-h-11 flex-col gap-1.5">
        {tasks.map((t) => (
          <Card key={t.id} task={t} parentTitle={parentOf(t)} />
        ))}
      </ul>
    </section>
  )
}

export function TaskBoard({ projectId }: { projectId: string }) {
  const tasks = useQuery({
    queryKey: tasksKey(projectId),
    queryFn: () => listProjectTasks(projectId),
  })
  const [error, setError] = useState<string | null>(null)
  const actions = useTaskActions(setError)
  // The same 5px threshold the tree uses, so a click on a card is a click and not a one-pixel drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const rows = tasks.data?.tasks ?? []
  const byId = new Map(rows.map((t) => [t.id, t]))
  const parentOf = (t: TaskResponse) =>
    t.parentId === null ? null : (byId.get(t.parentId)?.title ?? null)

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return
    const status = over.id as TaskStatus
    const task = byId.get(String(active.id))
    if (!task || task.status === status) return
    setError(null)
    // The same mutation the row markers use, so a card and a marker cannot disagree about what
    // moving to “Done” means (it stamps `completed_at`, among other things).
    actions.setStatus(task.id, status)
  }

  if (tasks.isSuccess && rows.length === 0)
    return <PanelEmpty>No tasks in this project yet</PanelEmpty>

  return (
    <>
      {error && (
        <p role="alert" className="px-2 pb-1 text-sm text-danger">
          {error}
        </p>
      )}
      <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={onDragEnd}>
        {/* Four columns at desk width; on a phone they stack, because four 90px columns are four
            columns of ellipsis. No horizontal scroller: the row system's rule is that nothing
            scrolls sideways. */}
        <div className="grid min-w-0 grid-cols-1 gap-2 px-1 sm:grid-cols-2 lg:grid-cols-4">
          {COLUMNS.map((status) => (
            <Column
              key={status}
              status={status}
              tasks={rows.filter((t) => t.status === status)}
              parentOf={parentOf}
            />
          ))}
        </div>
      </DndContext>
      {/* `cancelled` has no column: it is not a step of the work, and a fifth column of things
          nobody is doing would take a quarter of the width to say so. Those tasks are in the
          tree, where they can be restored. */}
    </>
  )
}
