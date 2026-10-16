import {
  idFrom,
  taskId,
  BOARD_TASK_STATUSES,
  type TaskResponse,
  type TaskStatus,
  type ProjectId,
  type TaskId,
} from '@ctws/contracts'
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
import { projectTasksQuery } from '../api'
import { useTaskActions } from '../hooks/useTaskActions'
import { PanelEmpty } from '../../../platform/ui/Panel'
import { STATUS_LABEL } from '../logic/status'
import { TaskDetail } from './TaskDetail'
import { useTaskParam } from './tree/useTreeParams'
import { type RowRefs, useRowPane, useRowRefs } from './useRowPane'

// The board is flat: every task once, under its own status, with its parent named beneath it.

/** A card opens its task in the pane on click, Enter or Space, and is dragged by the pointer. */
function Card({
  task,
  parentTitle,
  cardRef,
  onOpen,
}: {
  task: TaskResponse
  parentTitle: string | null
  cardRef: (el: HTMLElement | null) => () => void
  onOpen: () => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id })
  return (
    <li>
      <button
        ref={(el) => {
          setNodeRef(el)
          const forget = cardRef(el)
          // A ref that returns a cleanup is not called again with null, so this says it instead.
          return () => {
            setNodeRef(null)
            forget()
          }
        }}
        {...listeners}
        {...attributes}
        type="button"
        data-board-card={task.id}
        onClick={onOpen}
        className={`w-full rounded-[10px] border border-transparent bg-sheet px-2.5 py-2 text-left hover:border-rule-strong ${
          isDragging ? 'opacity-40' : ''
        }`}
      >
        <span className="block text-sm text-ink">{task.title}</span>
        {parentTitle && (
          <span className="mt-0.5 block truncate text-xs text-ink-subtle">{parentTitle}</span>
        )}
      </button>
    </li>
  )
}

function Column({
  status,
  tasks,
  parentOf,
  cards,
  onOpen,
}: {
  status: TaskStatus
  tasks: TaskResponse[]
  parentOf: (t: TaskResponse) => string | null
  cards: RowRefs
  onOpen: (id: TaskId) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  return (
    <section
      ref={setNodeRef}
      aria-label={STATUS_LABEL[status]}
      data-board-column={status}
      className={`flex min-w-0 flex-col rounded-[10px] p-2 ${isOver ? 'bg-hover' : 'bg-desk'}`}
    >
      <h3 className="flex items-baseline gap-2 px-1 pb-1.5 text-sm font-semibold text-ink-muted">
        {STATUS_LABEL[status]}
        {tasks.length > 0 && (
          <span data-count className="text-xs text-ink-subtle tabular-nums">
            {tasks.length}
          </span>
        )}
      </h3>
      <ul className="flex min-h-11 flex-col gap-1.5">
        {tasks.map((t) => (
          <Card
            key={t.id}
            task={t}
            parentTitle={parentOf(t)}
            cardRef={cards.ref(t.id)}
            onOpen={() => onOpen(t.id)}
          />
        ))}
      </ul>
    </section>
  )
}

export function TaskBoard({ projectId }: { projectId: ProjectId }) {
  const tasks = useQuery(projectTasksQuery(projectId))
  const [error, setError] = useState<string | null>(null)
  const actions = useTaskActions(setError)
  // The same 5px threshold the tree uses, so a click on a card is a click and not a one-pixel drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const rows = tasks.data?.tasks ?? []
  const byId = new Map(rows.map((t) => [t.id, t]))
  const parentOf = (t: TaskResponse) =>
    t.parentId === null ? null : (byId.get(t.parentId)?.title ?? null)

  // The same pane and address as the tree's. Closed, focus goes back to the card; if the pane
  // takes its task away (deleted), to a neighbouring card.
  const { openId, setOpenId } = useTaskParam()
  const cards = useRowRefs()
  const pane = useRowPane({
    rows: cards,
    tasks: rows,
    settled: tasks.isSuccess,
    openId,
    setOpenId,
    heading: () => document.querySelector<HTMLElement>('h1'),
  })
  const openTask = pane.openTask

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const status = BOARD_TASK_STATUSES.find((s) => s === over?.id)
    const task = byId.get(idFrom(taskId, String(active.id)))
    if (!status || !task || task.status === status) return
    setError(null)
    // The same mutation the row markers use, so a card and a marker agree on what “Done” means.
    actions.setStatus(task.id, status)
  }

  // As the tree does: nothing while loading, and a failure said rather than four empty columns.
  if (tasks.isError)
    return (
      <p role="alert" className="mt-4 text-sm text-danger">
        Couldn't load tasks
      </p>
    )
  if (!tasks.isSuccess) return null
  if (rows.length === 0) return <PanelEmpty>No tasks in this project yet</PanelEmpty>

  return (
    <>
      {error && (
        <p role="alert" className="px-2 pb-1 text-sm text-danger">
          {error}
        </p>
      )}
      <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={onDragEnd}>
        {/* Four columns at desk width, stacked on a phone: nothing scrolls sideways. */}
        <div className="grid min-w-0 grid-cols-1 gap-2 px-1 sm:grid-cols-2 lg:grid-cols-4">
          {BOARD_TASK_STATUSES.map((status) => (
            <Column
              key={status}
              status={status}
              tasks={rows.filter((t) => t.status === status)}
              parentOf={parentOf}
              cards={cards}
              onOpen={setOpenId}
            />
          ))}
        </div>
      </DndContext>
      {/* Cancelled tasks have no column; they stay in the tree, where they can be restored. */}
      {openTask && <TaskDetail key={openTask.id} task={openTask} onClose={pane.close} />}
    </>
  )
}
