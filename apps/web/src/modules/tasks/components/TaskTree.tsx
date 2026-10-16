import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { type TaskResponse, type TaskStatus, type ProjectId, type TaskId } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { Fragment, useMemo, useState } from 'react'
import { EMPTY_ACTION, EmptyState } from '../../../platform/ui/EmptyState'
import { useProjects } from '../../../shell/projects'
import { LIST_MEASURE, ROW_LIST } from '../../../shell/rows'
import { projectTasksQuery } from '../api'
import { useTaskActions } from '../hooks/useTaskActions'
import { rollupPhrase } from '../logic/rollupPhrase'
import { isFinished } from '../logic/status'
import { flatten } from '../logic/tree/flatten'
import { NewTaskInput } from './NewTaskInput'
import { SelectionBar } from './SelectionBar'
import { TaskDetail } from './TaskDetail'
import { TaskRow } from './TaskRow'
import { useRowPane, useRowRefs } from './useRowPane'
import { useSavedFlash } from './useSavedFlash'
import { useBulkSelection } from './tree/useBulkSelection'
import { useCollapsed } from './tree/useCollapsed'
import { useInlineAdd } from './tree/useInlineAdd'
import { useTreeKeys } from './tree/useTreeKeys'
import { useTreeMove } from './tree/useTreeMove'
import { useTreeParams } from './tree/useTreeParams'
import { useTreeVisibility } from './tree/useTreeVisibility'

const NONE: readonly TaskResponse[] = []

export function TaskTree({
  projectId,
  addFirst,
}: {
  projectId: ProjectId
  /** Puts the cursor in the box above the tree that adds a root task. */
  addFirst: () => void
}) {
  const allProjects = useProjects()
  // Only the inbox dates its rows: quick capture makes it the one list that grows undecided.
  const inInbox = allProjects.data?.find((p) => p.id === projectId)?.isInbox === true
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

  // Each row's handle, which focus moves between.
  const handles = useRowRefs()
  const { openId, setOpenId } = useTreeParams({
    rows: handles,
    tasks: tasks.data?.tasks,
    unfold: folds.unfold,
    showDone: shown.showDone,
    showFinished: shown.showFinished,
    onRevealed: setActiveId,
  })
  // The pane can move or delete its task: focus then goes to a neighbouring row, not to <body>.
  const pane = useRowPane({
    rows: handles,
    tasks: all,
    settled: tasks.isSuccess,
    openId,
    setOpenId,
    heading: () => document.querySelector<HTMLElement>('h1'),
  })
  const openTask = pane.openTask

  const [savedId, setSavedId] = useSavedFlash()

  const actions = useTaskActions(setError)
  /** Every status change the tree makes: a row finished here stays on screen, however it was. */
  const setStatus = (id: TaskId, status: TaskStatus) => {
    setError(null)
    if (isFinished(status)) shown.keep([id])
    actions.setStatus(id, status)
  }
  const adder = useInlineAdd({
    projectId,
    unfold: folds.unfold,
    onRefuse: setError,
    focus: (id) => handles.get(id)?.focus(),
  })
  const picked = useBulkSelection({
    projectId,
    visible: rows.map((r) => r.id),
    onFinished: shown.keep,
    onError: setError,
  })

  // Distance, so a plain click on the handle (to focus it) is not taken for a drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const { run, blockLength, onDragEnd } = useTreeMove({ projectId, rows, folds, onError: setError })

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
    focusRow: (index) => {
      const row = rows[index]
      if (row) handles.get(row.id)?.focus()
    },
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
              onClick={addFirst}
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
            {rows.flatMap((row, i) => [
              <TaskRow
                key={row.id}
                row={row}
                projectId={projectId}
                task={byId.get(row.id)}
                aged={inInbox}
                rollup={row.hasChildren ? rollupPhrase(tasks.data?.rollups[row.id]) : null}
                blockedBy={tasks.data?.blockers[row.id]}
                state={{
                  saved: savedId === row.id,
                  selected: picked.selected.has(row.id),
                  tabStop: row.id === tabId,
                }}
                handleRef={handles.ref(row.id)}
                on={{
                  focus: () => setActiveId(row.id),
                  setStatus: (status) => setStatus(row.id, status),
                  toggle: () => folds.toggle(row.id),
                  keyDown: (e) => onKeyDown(e, i),
                  open: () => setOpenId(row.id),
                  toggleSelected: () => picked.toggle(row.id),
                  addChild: () => adder.addChild(row),
                }}
              />,
              ...(inputSlot === i + 1 ? [<Fragment key="new-task">{input}</Fragment>] : []),
            ])}
          </ul>
        </SortableContext>
      </DndContext>
      {openTask && (
        // A save marks the row and leaves the pane open, reading back what was written.
        <TaskDetail
          key={openTask.id}
          task={openTask}
          onClose={pane.close}
          onSaved={() => setSavedId(openTask.id)}
        />
      )}
    </>
  )
}
