import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import {
  taskId,
  idFrom,
  type TaskPosition,
  type TaskResponse,
  type TaskStatus,
  type ProjectId,
  type TaskId,
} from '@ctws/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { EMPTY_ACTION, EmptyState } from '../../../platform/ui/EmptyState'
import { useProjects } from '../../../shell/projects'
import { LIST_MEASURE, ROW_LIST } from '../../../shell/rows'
import { moveTask, type ProjectTasks, projectTasksQuery } from '../api'
import { useTaskActions } from '../hooks/useTaskActions'
import { rollupPhrase } from '../rollupPhrase'
import { isFinished } from '../status'
import { applyMove } from '../tree/applyMove'
import { planDrop } from '../tree/drop'
import { flatten } from '../tree/flatten'
import { NewTaskInput } from './NewTaskInput'
import { SelectionBar } from './SelectionBar'
import { TaskDetail } from './TaskDetail'
import { TaskRow } from './TaskRow'
import { useFocusAfterRemoval } from './useFocusAfterRemoval'
import { useSavedFlash } from './useSavedFlash'
import { INDENT_PX } from './TaskRowParts'
import { useBulkSelection } from './tree/useBulkSelection'
import { useCollapsed } from './tree/useCollapsed'
import { useInlineAdd } from './tree/useInlineAdd'
import { useTreeKeys } from './tree/useTreeKeys'
import { useTreeParams } from './tree/useTreeParams'
import { useTreeVisibility } from './tree/useTreeVisibility'

const NONE: readonly TaskResponse[] = []

export function TaskTree({ projectId }: { projectId: ProjectId }) {
  const qc = useQueryClient()
  const allProjects = useProjects()
  // Only the inbox dates its rows: quick capture makes it the one list that grows undecided.
  const inInbox = allProjects.data?.find((p) => p.id === projectId)?.isInbox === true
  const key = projectTasksQuery(projectId).queryKey
  // The cache holds exactly what the server returns; the rows are derived, never cached.
  const tasks = useQuery(projectTasksQuery(projectId))
  const all = tasks.data?.tasks ?? NONE
  const byId = useMemo(() => new Map(all.map((t) => [t.id, t])), [all])

  // Said above the tree: a refused move or a depth limit has no single row to sit beside.
  const [error, setError] = useState<string | null>(null)
  const folds = useCollapsed(projectId)
  const shown = useTreeVisibility(projectId, all)
  const rows = useMemo(
    () => flatten(shown.visible, folds.collapsed),
    [shown.visible, folds.collapsed],
  )

  // The tree's single tab stop follows focus; if that row has gone, the first row takes it.
  const [activeId, setActiveId] = useState<TaskId | null>(null)
  const tabId = rows.some((r) => r.id === activeId) ? activeId : (rows[0]?.id ?? null)

  const { openId, setOpenId } = useTreeParams({
    tasks: tasks.data?.tasks,
    unfold: folds.unfold,
    showDone: shown.showDone,
    showFinished: shown.showFinished,
    onRevealed: setActiveId,
  })
  // Looked up each render, so a task that has left this project closes its own pane.
  const openTask = tasks.data?.tasks.find((t) => t.id === openId)

  const [savedId, setSavedId] = useSavedFlash()

  const actions = useTaskActions(setError)
  /** Every status change the tree makes: a row finished here stays on screen, however it was. */
  const setStatus = (id: TaskId, status: TaskStatus) => {
    setError(null)
    if (isFinished(status)) shown.keep([id])
    actions.setStatus(id, status)
  }
  const adder = useInlineAdd({ projectId, unfold: folds.unfold, onRefuse: setError })
  const picked = useBulkSelection({
    projectId,
    visible: rows.map((r) => r.id),
    onFinished: shown.keep,
    onError: setError,
  })

  // Distance, so a plain click on the handle (to focus it) is not taken for a drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

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
      setError(e instanceof Error ? e.message : "Couldn't move it")
    },
    meta: { awaits: [key] },
  })

  /** Drops `draggedId` at `slot` at `wantedDepth`, if the plan allows it. */
  const run = (draggedId: TaskId, slot: number, wantedDepth: number) => {
    if (slot < 0 || slot > rows.length) return
    const plan = planDrop({ rows, draggedId, slot, wantedDepth })
    if (!plan.ok) {
      if (plan.reason === 'own-subtree') setError('A task cannot move inside itself')
      else if (plan.reason === 'too-deep') setError('Too deep to move it there')
      return
    }
    setError(null)
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

  const blockLength = (index: number) => {
    let end = index + 1
    while (end < rows.length && rows[end]!.depth > rows[index]!.depth) end++
    return end - index
  }

  const onKeyDown = useTreeKeys({
    rows,
    statusOf: (id) => byId.get(id)?.status ?? 'todo',
    setStatus,
    open: (id) => setOpenId(id),
    addChild: adder.addChild,
    addSibling: (row) => adder.start(row.parentId, row.id),
    move: run,
    blockLength,
    toggle: folds.toggle,
  })

  // The input sits after the last visible row of its parent's subtree (or of the whole list for
  // the root level): the end of the sibling group, where the server will put the new task.
  let inputSlot = -1
  let inputDepth = 1
  if (adder.adding) {
    const parentId = adder.adding.parentId
    const at = parentId === null ? -1 : rows.findIndex((r) => r.id === parentId)
    inputSlot = at < 0 ? rows.length : at + blockLength(at)
    inputDepth = at < 0 ? 1 : rows[at]!.depth + 1
  }
  const input = adder.adding && (
    <NewTaskInput
      depth={inputDepth}
      onCommit={adder.commit}
      onCancel={adder.cancel}
      error={adder.error}
    />
  )

  const onDragEnd = ({ active, over, delta }: DragEndEvent) => {
    const from = rows.findIndex((r) => r.id === active.id)
    const overIndex = over ? rows.findIndex((r) => r.id === over.id) : -1
    if (from < 0 || overIndex < 0) return
    // Dropping below the target lands after its whole visible block, not inside it.
    const slot = overIndex > from ? overIndex + blockLength(overIndex) : overIndex
    run(rows[from]!.id, slot, rows[from]!.depth + Math.round(delta.x / INDENT_PX))
  }

  // Focus goes back to the handle that opened the pane (a moved-away task has none left).
  const closeDetail = () => {
    const id = openId
    setOpenId(null)
    if (id) document.querySelector<HTMLElement>(`[data-handle-id="${id}"]`)?.focus()
  }

  // The pane can move or delete its task: focus then goes to a neighbouring row, not to <body>.
  useFocusAfterRemoval({
    ids: () =>
      [...document.querySelectorAll<HTMLElement>('[data-handle-id]')].map((el) =>
        idFrom(taskId, el.dataset.handleId!),
      ),
    rowFor: (id) => document.querySelector<HTMLElement>(`[data-handle-id="${id}"]`),
    heading: () => document.querySelector<HTMLElement>('h1'),
    open: openId,
  })
  // And it unmounts without onClose. Nobody took that step, so the address is put right in place.
  useEffect(() => {
    if (openId && tasks.isSuccess && !openTask) setOpenId(null, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setOpenId is new each render; this reacts to the data.
  }, [openId, openTask, tasks.isSuccess])

  return (
    <>
      {/* Absent until there is something to say; the count is the label. */}
      {(shown.hiddenDone > 0 || shown.showDone) && (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={shown.toggleDone}
            aria-pressed={shown.showDone}
            className="min-h-8 rounded-md px-2 text-sm text-ink-muted hover:bg-hover hover:text-ink"
          >
            {shown.showDone ? 'Hide done' : `${shown.hiddenDone} done`}
          </button>
        </div>
      )}
      <SelectionBar
        count={picked.selected.size}
        projects={allProjects.data ?? []}
        currentProjectId={projectId}
        onFinish={() => void picked.finish()}
        onMove={(to) => void picked.moveTo(to)}
        onClear={picked.clear}
        busy={picked.busy}
      />
      {tasks.isError && (
        <p role="alert" className="mt-4 text-sm text-danger">
          Couldn't load tasks
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      )}
      {tasks.isSuccess && rows.length === 0 && !adder.adding && (
        // Two different empties: nothing yet, and everything finished. Telling someone who just
        // cleared their list they "have no tasks yet" reads as having lost the work.
        <EmptyState
          title={shown.hiddenDone > 0 ? 'This project is clear' : 'No tasks in this project yet'}
          action={
            <button
              type="button"
              className={EMPTY_ACTION}
              // Puts the cursor in the input already on this page.
              onClick={() =>
                document.querySelector<HTMLElement>('input[aria-label="New task"]')?.focus()
              }
            >
              {shown.hiddenDone > 0 ? 'Add another' : 'Add the first task'}
            </button>
          }
        />
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
          <ul data-task-tree className={`${ROW_LIST} ${LIST_MEASURE}`}>
            {/* One flat list with the input keyed beside the rows, not inside the one it follows:
                when a created row lands the input moves after it instead of being rebuilt, and an
                Enter typed into a rebuilt box would be dropped. */}
            {rows.flatMap((row, i) => {
              const task = byId.get(row.id)
              return [
                <TaskRow
                  key={row.id}
                  row={row}
                  projectId={projectId}
                  title={task?.title ?? ''}
                  status={task?.status ?? 'todo'}
                  dueAt={task?.dueAt ?? null}
                  scheduledOn={task?.scheduledOn ?? null}
                  hasNotes={(task?.notes ?? '') !== ''}
                  capturedAt={inInbox ? (task?.createdAt ?? null) : null}
                  rollup={row.hasChildren ? rollupPhrase(tasks.data?.rollups[row.id]) : null}
                  blockedBy={tasks.data?.blockers[row.id]}
                  saved={savedId === row.id}
                  tabStop={row.id === tabId}
                  onFocus={() => setActiveId(row.id)}
                  onSetStatus={(status) => setStatus(row.id, status)}
                  onToggle={() => folds.toggle(row.id)}
                  onKeyDown={(e) => onKeyDown(e, i)}
                  onOpen={() => setOpenId(row.id)}
                  selected={picked.selected.has(row.id)}
                  onToggleSelected={() => picked.toggle(row.id)}
                  onAddChild={() => adder.addChild(row)}
                />,
                ...(inputSlot === i + 1 ? [<Fragment key="new-task">{input}</Fragment>] : []),
              ]
            })}
          </ul>
        </SortableContext>
      </DndContext>
      {openTask && (
        // A save marks the row and leaves the pane open, reading back what was written.
        <TaskDetail
          key={openTask.id}
          task={openTask}
          onClose={closeDetail}
          onSaved={() => setSavedId(openTask.id)}
        />
      )}
    </>
  )
}
