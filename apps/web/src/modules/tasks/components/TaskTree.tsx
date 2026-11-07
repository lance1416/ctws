import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import {
  type ProjectId,
  type StageId,
  type TaskId,
  type TaskPosition,
  type TaskResponse,
} from '@ctws/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { useDelayed } from '../../../platform/time/useDelayed'
import { BlockFailed } from '../../../platform/ui/Block'
import { CollapseIcon } from '../../../platform/ui/icons'
import { MoveToProject, useProjects } from '../../../shell/projects'
import { moveTask, patchTask, projectTasksQuery, taskKeys } from '../api'
import { useTaskActions } from '../hooks/useTaskActions'
import { isFinished, REOPEN, type StatusMove } from '../logic/status'
import { blockLength, flatten } from '../logic/tree/flatten'
import { leafCounts } from '../logic/tree/leafCounts'
import { placeOf } from '../logic/tree/applyMove'
import { useUndo } from '../../../platform/ui/undo'
import { NewTaskInput } from './NewTaskInput'
import { SelectionBar } from './SelectionBar'
import { TaskDetail } from './TaskDetail'
import { TaskRow } from './TaskRow'
import { titleStart, TREE_BOX, TREE_COL, TREE_ROW } from './TaskRowParts'
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
 * The tree: one block, a row of column names, then the tasks; `last` is the row that adds a task at
 * the end. Empty, it is those two alone: the empty table says there is nothing, and the row is the
 * way to add.
 */
export function TaskTree({ projectId, last }: { projectId: ProjectId; last: ReactNode }) {
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
  // The inbox's row being moved to a project, and the move itself.
  const [moving, setMoving] = useState<TaskResponse | null>(null)
  // Where it landed, said at the foot with the way back to where it was.
  const say = useUndo()
  const move = useMutation({
    mutationFn: ({ id, to, under }: { id: TaskId; to: ProjectId; said: string; under?: TaskId }) =>
      patchTask(id, { projectId: to, parentId: under ?? null }),
    meta: { changes: ['task'], awaits: [taskKeys.all], ownsError: true },
    onMutate: ({ id }) => placeOf(all, id, projectId),
    onSuccess: (_, { id, said }, back) => {
      setMoving(null)
      if (back) say.offer({ said, undo: () => moveBack.mutateAsync({ id, back }) })
    },
  })
  const moveBack = useMutation({
    mutationFn: ({ id, back }: { id: TaskId; back: TaskPosition }) => moveTask(id, back),
    meta: { changes: ['task'], awaits: [taskKeys.all], ownsError: true },
  })
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

  const actions = useTaskActions()
  /** Every status change the tree makes: a row finished here stays on screen, however it was. */
  const setStatus = (id: TaskId, status: StatusMove) => {
    setError(null)
    if (status !== REOPEN && isFinished(status)) shown.keep([id])
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
    moveTo: inInbox ? (id) => setMoving(byId.get(id) ?? null) : undefined,
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
  // Each group's "12 done" goes after the last row it would show among: at the end of its parent's
  // block, or of the list for the project's own. Nested ones that end together are said innermost
  // first.
  const doneAfter = new Map<number, { group: DoneGroup; depth: number }[]>()
  const sayDone = (at: number, group: DoneGroup, depth: number) => {
    const counts = shown.closed.get(group)
    if (!counts || (shown.isOpen(group) ? counts.all : counts.hidden) === 0) return
    // Deepest first, the project's own last: each closes the block it belongs to.
    const here = [...(doneAfter.get(at) ?? []), { group, depth }]
    doneAfter.set(
      at,
      here.sort((a, b) => b.depth - a.depth),
    )
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
          <div className="col-span-full" style={{ paddingLeft: titleStart(depth) }}>
            {/* The app's word about the rows, not one of them: in italics, with a fold to open. */}
            <button
              type="button"
              onClick={() => shown.toggle(group)}
              aria-pressed={open}
              className="-ml-1.5 flex h-7 items-center gap-1 rounded-control px-1.5 text-meta text-muted italic hover:bg-hover hover:text-ink"
            >
              <CollapseIcon
                size={12}
                aria-hidden="true"
                className={`shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
              />
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

  const mover = moving && (
    <MoveToProject
      of={{ type: 'task', id: moving.id }}
      title={`Move “${moving.title}” to`}
      from={moving.projectId}
      height={rows.find((r) => r.id === moving.id)?.subtreeHeight ?? 1}
      busy={move.isPending}
      error={move.isError ? 'Couldn’t move it. Try again.' : null}
      onPick={(to) =>
        move.mutate({
          id: moving.id,
          to,
          said: `Moved to ${allProjects.data?.find((p) => p.id === to)?.name ?? 'the project'}`,
        })
      }
      onPickParent={({ project, parent }) =>
        move.mutate({
          id: moving.id,
          to: project.id,
          under: parent.id,
          said: `Moved to ${project.name} › ${parent.title}`,
        })
      }
      onClose={() => {
        move.reset()
        setMoving(null)
      }}
    />
  )

  // Reading or not read: the tree's own block says so, and never draws an empty project with its
  // "New task".
  if (tasks.isError)
    return (
      <div className="rounded-container border border-line bg-panel">
        <BlockFailed what="tasks" onRetry={() => void tasks.refetch()} />
      </div>
    )
  if (tasks.isPending) return <TreeLoading />

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
      {error && (
        <p role="alert" className="mt-4 text-ui text-stop-t">
          {error}
        </p>
      )}
      <div
        // The inbox's rows carry Move to… too: where the controls always show they take more room.
        className={`${TREE_BOX} overflow-hidden rounded-container border border-line bg-panel ${inInbox ? '[--row-acts:164px]' : ''}`}
      >
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            <div
              role="presentation"
              aria-hidden="true"
              data-tree-head
              className={`${TREE_ROW} ${TREE_HEAD}`}
            >
              <TreeHeadCells />
            </div>
            <ul data-task-tree className="flex flex-col">
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
                  opensGroup={row.hasChildren && row.depth === 1 && i > 0}
                  stage={stageOf(byId.get(row.id)?.stageId ?? null)}
                  blockedBy={tasks.data?.blockers[row.id]}
                  organisations={tasks.data?.organisations[row.id]}
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
                    moveTo: inInbox ? () => setMoving(byId.get(row.id) ?? null) : undefined,
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
      {mover}
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

/** The tree's block in grey rows under its column names, after the first 300 ms. */
function TreeLoading() {
  const shown = useDelayed()
  if (!shown) return null
  return (
    <div
      aria-busy="true"
      className={`${TREE_BOX} overflow-hidden rounded-container border border-line bg-panel`}
    >
      <div aria-hidden="true" className={`${TREE_ROW} ${TREE_HEAD}`}>
        <TreeHeadCells />
      </div>
      <div className="flex flex-col py-1">
        {[62, 48, 55, 40].map((width, i) => (
          <div key={i} className={TREE_ROW}>
            <span className="flex items-center gap-2.5">
              <span className="size-4 shrink-0 rounded-full bg-line" />
              <span className="h-2.5 rounded-small bg-line" style={{ width: `${width}%` }} />
            </span>
            <span className={TREE_COL.status} />
            <span className={TREE_COL.stage} />
            <span className={`h-2.5 w-12 rounded-small bg-line opacity-60 ${TREE_COL.progress}`} />
            <span className={`h-2.5 w-10 rounded-small bg-line opacity-60 ${TREE_COL.due}`} />
          </div>
        ))}
      </div>
    </div>
  )
}

/** The column names, on the band in small capitals, each where its column shows. */
const TREE_HEAD = 'border-b border-line bg-band text-overline text-muted uppercase'

function TreeHeadCells() {
  const cell = 'h-8 items-center'
  return (
    <>
      <span className={`flex ${cell}`}>Name</span>
      <span className={`${cell} ${TREE_COL.status}`}>Status</span>
      <span className={`${cell} ${TREE_COL.stage}`}>Stage</span>
      <span className={`${cell} ${TREE_COL.progress}`}>Progress</span>
      <span className={`${cell} ${TREE_COL.due}`}>Due</span>
    </>
  )
}
