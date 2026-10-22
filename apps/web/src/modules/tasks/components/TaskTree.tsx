import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import {
  type ProjectId,
  type StageId,
  type TaskId,
  type TaskResponse,
  type TaskStatus,
} from '@ctws/contracts'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { EMPTY_ACTION, EmptyState } from '../../../platform/ui/EmptyState'
import { useProjects } from '../../../shell/projects'
import { projectTasksQuery } from '../api'
import { useTaskActions } from '../hooks/useTaskActions'
import { isFinished } from '../logic/status'
import { blockLength, flatten } from '../logic/tree/flatten'
import { leafCounts } from '../logic/tree/leafCounts'
import { NewTaskInput } from './NewTaskInput'
import { SelectionBar } from './SelectionBar'
import { TaskDetail } from './TaskDetail'
import { TaskRow } from './TaskRow'
import { titleStart, TREE_ROW, WIDE_ONLY } from './TaskRowParts'
import { useRowPane, useRowRefs } from './useRowPane'
import { useSavedFlash } from './useSavedFlash'
import { useBulkSelection } from './tree/useBulkSelection'
import { useCollapsed } from './tree/useCollapsed'
import { useInlineAdd } from './tree/useInlineAdd'
import { useTreeKeys } from './tree/useTreeKeys'
import { useTreeMove } from './tree/useTreeMove'
import { useTreeParams } from './tree/useTreeParams'
import { useTreeVisibility, type DoneGroup } from './tree/useTreeVisibility'

const NONE: readonly TaskResponse[] = []

/**
 * THE TREE (FR-054, artboard 8): one block, a row of column names, then the tasks in their
 * columns; `last` is the row that adds a task at the end.
 */
export function TaskTree({
  projectId,
  addFirst,
  last,
}: {
  projectId: ProjectId
  /** Puts the cursor in the box that adds a root task. */
  addFirst: () => void
  last: ReactNode
}) {
  const qc = useQueryClient()
  const allProjects = useProjects()
  // Only the inbox dates its rows: quick capture makes it the one list that grows undecided.
  const inInbox = allProjects.data?.find((p) => p.id === projectId)?.isInbox === true
  // The cache holds exactly what the server returns; the rows are derived, never cached.
  const tasks = useQuery(projectTasksQuery(projectId))
  const all = tasks.data?.tasks ?? NONE
  const byId = useMemo(() => new Map(all.map((t) => [t.id, t])), [all])
  // Every parent's leaves, from the whole list: a folded parent still says how far along it is.
  const counts = useMemo(() => leafCounts(all), [all])
  const stages = useMemo(
    () => new Map((tasks.data?.stages ?? []).map((stage) => [stage.id, stage])),
    [tasks.data],
  )

  // Said above the tree: a refused move or a depth limit has no single row to sit beside.
  const [error, setError] = useState<string | null>(null)
  const folds = useCollapsed(projectId)
  const shown = useTreeVisibility(projectId, all)
  const rows = useMemo(
    () => flatten(shown.visible, folds.collapsed),
    [shown.visible, folds.collapsed],
  )
  /** The rows as the cache holds them now, a move ahead of the screen while it is drawn. */
  const rowsNow = () => {
    const now = qc.getQueryData(projectTasksQuery(projectId).queryKey)
    return now ? flatten(shown.visibleOf(now.tasks), folds.collapsed) : rows
  }

  // The tree's single tab stop follows focus; if that row has gone, the first row takes it.
  const [activeId, setActiveId] = useState<TaskId | null>(null)
  const tabId = rows.some((r) => r.id === activeId) ? activeId : (rows[0]?.id ?? null)

  // Each row's handle, which focus moves between.
  const handles = useRowRefs()
  const { openId, setOpenId } = useTreeParams({
    rows: handles,
    tasks: tasks.data?.tasks,
    unfold: folds.unfold,
    showFinished: shown.reveal,
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
  const { run, onDragEnd } = useTreeMove({
    projectId,
    rows: rowsNow,
    folds,
    onError: setError,
  })

  const onKeyDown = useTreeKeys({
    rows: rowsNow,
    statusOf: (id) => byId.get(id)?.status ?? 'todo',
    setStatus,
    open: (id) => setOpenId(id),
    addChild: adder.addChild,
    addSibling: (row) => adder.start(row.parentId, row.id),
    move: run,
    toggle: folds.toggle,
    focusRow: (row) => {
      if (row) handles.get(row.id)?.focus()
    },
  })

  const stageOf = (id: StageId | null) => {
    const stage = id === null ? undefined : stages.get(id)
    return stage ? { name: stage.name, quiet: stage.collapsed } : null
  }

  // The input sits after the last visible row of its parent's subtree (or of the whole list for
  // the root level): the end of the sibling group, where the server will put the new task.
  let inputSlot = -1
  let inputDepth = 1
  if (adder.adding) {
    const parentId = adder.adding.parentId
    const at = parentId === null ? -1 : rows.findIndex((r) => r.id === parentId)
    inputSlot = at < 0 ? rows.length : at + blockLength(rows, at)
    inputDepth = at < 0 ? 1 : rows[at]!.depth + 1
  }
  // Each group's "12 done" goes after the last row it would show among: at the end of its
  // parent's block, or of the list for the project's own (FR-054). Nested ones that end together
  // are said innermost first.
  const doneAfter = new Map<number, { group: DoneGroup; depth: number }[]>()
  const sayDone = (at: number, group: DoneGroup, depth: number) => {
    const counts = shown.closed.get(group)
    if (!counts || (shown.isOpen(group) ? counts.all : counts.hidden) === 0) return
    doneAfter.set(at, [{ group, depth }, ...(doneAfter.get(at) ?? [])])
  }
  rows.forEach((row, i) => {
    if (row.hasChildren && !row.collapsed) sayDone(i + blockLength(rows, i), row.id, row.depth + 1)
  })
  sayDone(rows.length, 'top', 1)
  const doneRows = (at: number) =>
    (doneAfter.get(at) ?? []).map(({ group, depth }) => {
      const open = shown.isOpen(group)
      return (
        // Not a row of the list: a way to show some. `none`, so it is not counted among them.
        <li key={`done:${group}`} role="none" data-done-group={group} className={TREE_ROW}>
          <div className="col-span-4" style={{ paddingLeft: titleStart(depth) }}>
            <button
              type="button"
              onClick={() => shown.toggle(group)}
              aria-pressed={open}
              className="-ml-1.5 h-7 rounded-control px-1.5 text-meta text-muted hover:bg-hover hover:text-ink"
            >
              {open ? 'Hide done' : `${shown.closed.get(group)!.hidden} done`}
            </button>
          </div>
        </li>
      )
    })

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
        <p role="alert" className="mt-4 text-ui text-stop-t">
          Couldn't load tasks
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-ui text-stop-t">
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
      <div className="mt-2 rounded-block border border-line bg-panel">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            <div
              role="presentation"
              aria-hidden="true"
              className={`${TREE_ROW} min-h-7.5 border-b border-line text-meta text-muted`}
            >
              <span>Name</span>
              <span className={WIDE_ONLY}>Stage</span>
              <span className={WIDE_ONLY}>Progress</span>
              <span>Due</span>
            </div>
            <ul data-task-tree className="flex flex-col py-1">
              {/* One flat list with the input keyed beside the rows, not inside the one it follows:
                when a created row lands the input moves after it instead of being rebuilt, and an
                Enter typed into a rebuilt box would be dropped. */}
              {rows.flatMap((row, i) => [
                <TaskRow
                  key={row.id}
                  row={row}
                  task={byId.get(row.id)}
                  aged={inInbox}
                  counts={row.hasChildren ? counts.get(row.id) : undefined}
                  stage={stageOf(byId.get(row.id)?.stageId ?? null)}
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
                    keyDown: (e) => onKeyDown(e, row.id),
                    open: () => setOpenId(row.id),
                    toggleSelected: () => picked.toggle(row.id),
                    addChild: () => adder.addChild(row),
                  }}
                />,
                ...(inputSlot === i + 1 ? [<Fragment key="new-task">{input}</Fragment>] : []),
                ...doneRows(i + 1),
              ])}
              {rows.length === 0 && doneRows(0)}
            </ul>
          </SortableContext>
        </DndContext>
        {/* After the list, not in it: it is a way to add a row, not one of them. */}
        {last}
      </div>
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
