import {
  idFrom,
  taskId,
  type ProjectId,
  type TaskId,
  type TaskResponse,
  type TaskStatus,
} from '@ctws/contracts'
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ymd } from '../../../../platform/time/dates'
import { useDelayed } from '../../../../platform/time/useDelayed'
import { useNow } from '../../../../platform/time/useNow'
import { BlockFailed } from '../../../../platform/ui/Block'
import { ByStageIcon, ByStatusIcon, PLACE_ICON } from '../../../../platform/ui/icons'
import { Segmented } from '../../../../platform/ui/Segmented'
import { useTimeZone } from '../../../../shell/auth'
import { projectTasksQuery, type ProjectTasks } from '../../api'
import { useTaskActions } from '../../hooks/useTaskActions'
import {
  BOARD_ORDER,
  boardColumns,
  GROUP_LIMIT,
  shownColumn,
  SIDE_STATUSES,
} from '../../logic/board/boardColumns'
import { cardBeside, statusBeside, type ShownColumn } from '../../logic/board/boardKeys'
import { STATUS_LABEL } from '../../logic/status'
import { leafCounts } from '../../logic/tree/leafCounts'
import { TaskDetail } from '../TaskDetail'
import { useTaskParam } from '../tree/useTreeParams'
import { useRowPane, useRowRefs } from '../useRowPane'
import { BoardCard, CardFace } from './BoardCard'
import { BoardColumn, BoardStrip } from './BoardColumn'
import { StageBoard } from './StageBoard'
import { useBoardFolds } from './useBoardFolds'

const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'] as const
const isStatus = (id: UniqueIdentifier | undefined): id is TaskStatus =>
  BOARD_ORDER.some((s) => s === id)

/** The tasks as they will be once one has moved: done just now, if that is where it went. */
const landed = (tasks: readonly TaskResponse[], id: TaskId, to: TaskStatus) =>
  tasks.map((t) => (t.id === id ? { ...t, status: to, completedAt: null } : t))

/**
 * THE BOARD BY STATUS (FR-057, artboard 21): the project's leaves in To do, In progress and Done,
 * with Backlog and Cancelled folded to strips at the sides; `add` is To do's "New task".
 */
export function TaskBoard({ projectId, add }: { projectId: ProjectId; add: ReactNode }) {
  const tasks = useQuery(projectTasksQuery(projectId))
  const [params, setParams] = useSearchParams()
  if (tasks.isError)
    return (
      <div className="rounded-block border border-line bg-panel">
        <BlockFailed what="tasks" onRetry={() => void tasks.refetch()} />
      </div>
    )
  if (!tasks.isSuccess) return <BoardLoading />
  // By stage only where some node has one (FR-058); the choice is in the address, as the view is.
  const hasStages = tasks.data.tasks.some((t) => t.stageId !== null)
  const byStage = hasStages && params.get('columns') === 'stage'
  const columnsSwitch = (
    <span className="flex items-center gap-2.5">
      <span className="text-meta text-subtle">Columns</span>
      <Segmented
        label="Columns"
        segments={[
          { id: 'status', label: 'Status', icon: ByStatusIcon },
          {
            id: 'stage',
            label: 'Stage',
            icon: ByStageIcon,
            ...(hasStages ? {} : { unavailable: 'No stages in this project yet' }),
          },
        ]}
        current={byStage ? 'stage' : 'status'}
        onPick={(id) =>
          setParams((prev) => {
            const next = new URLSearchParams(prev)
            if (id === 'stage') next.set('columns', 'stage')
            else next.delete('columns')
            return next
          })
        }
      />
    </span>
  )
  return byStage ? (
    <StageBoard projectId={projectId} data={tasks.data} columnsSwitch={columnsSwitch} />
  ) : (
    <Board projectId={projectId} data={tasks.data} add={add} columnsSwitch={columnsSwitch} />
  )
}

function Board({
  projectId,
  data,
  add,
  columnsSwitch,
}: {
  projectId: ProjectId
  data: ProjectTasks
  add: ReactNode
  columnsSwitch: ReactNode
}) {
  const all = data.tasks
  const byId = useMemo(() => new Map(all.map((t) => [t.id, t])), [all])
  const counts = useMemo(() => leafCounts(all), [all])
  const timeZone = useTimeZone()
  const today = ymd(useNow(), timeZone)

  const [allDone, setAllDone] = useState(false)
  const [sides, setSides] = useState<ReadonlySet<TaskStatus>>(new Set())
  // While a card is dragged the board is drawn as though it had landed where it is over.
  const [drag, setDrag] = useState<{ id: TaskId; over: TaskStatus | null } | null>(null)
  const columns = useMemo(
    () =>
      boardColumns(drag?.over ? landed(all, drag.id, drag.over) : all, {
        today,
        timeZone,
        allDone,
      }),
    [all, drag, today, timeZone, allDone],
  )
  const folds = useBoardFolds(projectId, columns)
  const opened = (status: TaskStatus) => !SIDE_STATUSES.includes(status) || sides.has(status)
  const shown = new Map(
    BOARD_ORDER.filter(opened).map((status) => [
      status,
      shownColumn(columns.get(status)!, {
        isOpen: (root) => folds.isOpen(status, root),
        isAll: (root) => folds.isAll(status, root),
        landing: drag?.id ?? null,
      }),
    ]),
  )
  const order: ShownColumn[] = [...shown].map(([status, groups]) => ({
    status,
    ids: groups.flatMap((g) => g.cards.map((c) => c.task.id)),
  }))

  // The board is one tab stop, on the card last focused, else the first.
  const [activeId, setActiveId] = useState<TaskId | null>(null)
  const ids = order.flatMap((c) => c.ids)
  const tabId = activeId && ids.includes(activeId) ? activeId : (ids[0] ?? null)

  const { openId, setOpenId } = useTaskParam()
  const cards = useRowRefs()
  const pane = useRowPane({
    rows: cards,
    tasks: all,
    settled: true,
    openId,
    setOpenId,
    heading: () => document.querySelector<HTMLElement>('h1'),
  })

  const [error, setError] = useState<string | null>(null)
  const actions = useTaskActions(setError)
  const strips = useRef(new Map<TaskStatus, HTMLButtonElement | null>())
  // A card moved from the keyboard keeps focus once it has been drawn in its new column (the
  // change reaches the cache a tick after the key), or the strip it went into has it.
  const focusNext = useRef<{ card: TaskId; in: TaskStatus } | { strip: TaskStatus } | null>(null)
  useEffect(() => {
    const next = focusNext.current
    if (!next) return
    const el = 'card' in next ? cards.get(next.card) : strips.current.get(next.strip)
    if (!el) return
    if (
      'card' in next &&
      el.closest<HTMLElement>('[data-board-column]')?.dataset.boardColumn !== next.in
    )
      return
    focusNext.current = null
    el.focus()
  })

  /** A new status, from a drop or Alt and an arrow; the card stays in sight where it lands. */
  const move = (task: TaskResponse, to: TaskStatus, { keys }: { keys: boolean }) => {
    if (task.status === to) return
    setError(null)
    actions.setStatus(task.id, to)
    if (!opened(to)) {
      if (keys) focusNext.current = { strip: to }
      return
    }
    const after = boardColumns(landed(all, task.id, to), { today, timeZone, allDone }).get(to)!
    const run = [{ root: null, cards: after.loose }, ...after.groups].find((r) =>
      r.cards.some((c) => c.task.id === task.id),
    )
    if (run) {
      const at = run.cards.findIndex((c) => c.task.id === task.id)
      folds.reveal(to, run.root?.id ?? null, at >= GROUP_LIMIT)
    }
    if (keys) focusNext.current = { card: task.id, in: to }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const arrow = ARROWS.find((k) => k === e.key)
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-board-card]')?.dataset
      .boardCard
    if (!arrow || !id || e.ctrlKey || e.metaKey || e.shiftKey) return
    const from = idFrom(taskId, id)
    if (e.altKey) {
      if (arrow === 'ArrowUp' || arrow === 'ArrowDown') return
      e.preventDefault()
      const task = byId.get(from)
      const to = task && statusBeside(task.status, arrow === 'ArrowLeft' ? -1 : 1)
      if (task && to) move(task, to, { keys: true })
      return
    }
    e.preventDefault()
    const next = cardBeside(order, from, arrow)
    if (next === from) return
    setActiveId(next)
    cards.get(next)?.focus()
  }

  // The same 5px threshold the tree uses, so a click on a card is a click and not a drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const lifted = drag ? byId.get(drag.id) : undefined
  const Review = PLACE_ICON.review

  return (
    <div className="flex flex-col gap-3.5">
      {/* Each label stays with its switch when the line wraps on a phone. */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
        {columnsSwitch}
        <span aria-hidden="true" className="flex-1" />
        <span className="flex items-center gap-2.5">
          <span className="text-meta text-subtle">Done shows</span>
          <Segmented
            label="Done shows"
            segments={[
              { id: 'week', label: 'This week' },
              { id: 'all', label: 'All' },
            ]}
            current={allDone ? 'all' : 'week'}
            onPick={(id) => setAllDone(id === 'all')}
          />
        </span>
      </div>
      {error && (
        <p role="alert" className="text-ui text-stop-t">
          {error}
        </p>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={({ active }) => setDrag({ id: idFrom(taskId, String(active.id)), over: null })}
        onDragOver={({ over }) =>
          setDrag((now) => now && { ...now, over: isStatus(over?.id) ? over.id : null })
        }
        onDragCancel={() => setDrag(null)}
        onDragEnd={({ active, over }) => {
          setDrag(null)
          const task = byId.get(idFrom(taskId, String(active.id)))
          if (task && isStatus(over?.id)) move(task, over.id, { keys: false })
        }}
      >
        <div data-board onKeyDown={onKeyDown} className="flex min-w-0 gap-3 max-md:flex-col">
          {BOARD_ORDER.map((status) => {
            const column = columns.get(status)!
            const side = SIDE_STATUSES.includes(status)
            if (!opened(status))
              return (
                <BoardStrip
                  key={status}
                  status={status}
                  count={column.count}
                  stripRef={(el) => void strips.current.set(status, el)}
                  onShow={() => setSides((now) => new Set(now).add(status))}
                />
              )
            return (
              <BoardColumn
                key={status}
                status={status}
                count={column.count}
                groups={shown.get(status)!}
                counts={counts}
                top={status === 'todo' ? add : undefined}
                bottom={
                  status === 'done' && (
                    <Link
                      to="/review"
                      className="flex h-7 items-center gap-1.5 rounded-control px-1.5 text-meta font-medium text-muted hover:bg-hover hover:text-ink"
                    >
                      <Review size={14} aria-hidden="true" />
                      Review this week
                    </Link>
                  )
                }
                onHide={
                  side
                    ? () =>
                        setSides((now) => {
                          const next = new Set(now)
                          next.delete(status)
                          return next
                        })
                    : undefined
                }
                onFold={(root) => folds.toggle(status, root)}
                onMore={(root) => folds.showAll(status, root)}
                card={(card) => (
                  <BoardCard
                    key={card.task.id}
                    card={card}
                    blockers={data.blockers[card.task.id]}
                    today={today}
                    timeZone={timeZone}
                    tabStop={card.task.id === tabId}
                    open={card.task.id === openId}
                    landing={card.task.id === drag?.id}
                    cardRef={cards.ref(card.task.id)}
                    onOpen={() => setOpenId(card.task.id)}
                    onFocus={() => setActiveId(card.task.id)}
                  />
                )}
              />
            )
          })}
        </div>
        <DragOverlay>
          {lifted && (
            <div className="flex cursor-grabbing flex-col gap-1 rounded-card bg-float px-2.5 py-2 shadow-float">
              <CardFace
                card={{ task: lifted, path: null }}
                blockers={data.blockers[lifted.id]}
                today={today}
                timeZone={timeZone}
              />
            </div>
          )}
        </DragOverlay>
      </DndContext>
      {pane.openTask && (
        <TaskDetail key={pane.openTask.id} task={pane.openTask} onClose={pane.close} />
      )}
    </div>
  )
}

/** Grey cards in the three columns, after the first 300 ms (FR-031). */
function BoardLoading() {
  const shown = useDelayed()
  if (!shown) return <div className="h-10" />
  return (
    <div aria-busy="true" className="flex gap-3 max-md:flex-col">
      {(['todo', 'in_progress', 'done'] as const).map((status) => (
        <div
          key={status}
          className="flex min-w-0 flex-1 basis-0 flex-col gap-2 rounded-block border border-line bg-chrome px-2 pb-2"
        >
          <span className="flex h-10 items-center pl-1 text-ui font-medium text-muted">
            {STATUS_LABEL[status]}
          </span>
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-9 rounded-card bg-line opacity-60" />
          ))}
        </div>
      ))}
    </div>
  )
}
