import {
  idFrom,
  stageId as stageIdSchema,
  taskId,
  type ProjectId,
  type StageId,
  type StageResponse,
  type TaskId,
} from '@ctws/contracts'
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { useMutation } from '@tanstack/react-query'
import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ymd } from '../../../../platform/time/dates'
import { useNow } from '../../../../platform/time/useNow'
import { ICON_BUTTON } from '../../../../platform/ui/buttonStyles'
import { BarExpandIcon, EditIcon, InStageIcon, NewIcon } from '../../../../platform/ui/icons'
import { useLineEntry } from '../../../../platform/ui/useLineEntry'
import { Button } from '../../../../platform/ui/Button'
import { useTimeZone } from '../../../../shell/auth'
import { useEveryProject } from '../../../../shell/projects'
import { createTask, projectTasksQuery, type ProjectTasks } from '../../api'
import { useTaskActions } from '../../hooks/useTaskActions'
import { cardBeside } from '../../logic/board/boardKeys'
import { STALE_DAYS, stageColumns, type StageCard } from '../../logic/board/stageColumns'
import { leafCounts } from '../../logic/tree/leafCounts'
import { ProgressSquare } from '../ProgressSquare'
import { StatusMark } from '../StatusMark'
import { TaskDetail } from '../TaskDetail'
import { OrganisationMark } from '../TaskRowParts'
import { useTaskParam } from '../tree/useTreeParams'
import { useRowPane, useRowRefs } from '../useRowPane'
import { DateChip } from './BoardCard'
import { EditStages } from './EditStages'

const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'] as const
/** A column the dragged card is over: its grey goes to `select`, laid over it. */
const OVER = 'shadow-[inset_0_0_0_100vmax_var(--color-select)]'

/**
 * THE BOARD BY STAGE (FR-058, artboard 20): a column per stage the project uses, in its order,
 * each the whole list of the nodes at that stage, scrolling inside itself; the stages folded by
 * default wait as strips at the right. A card is dragged to another stage, or moved with Alt and
 * an arrow; a column's + makes a node at its stage, at the top of the project.
 */
export function StageBoard({
  projectId,
  data,
  columnsSwitch,
}: {
  projectId: ProjectId
  data: ProjectTasks
  /** The head's Status / Stage switch, the board's to place. */
  columnsSwitch: ReactNode
}) {
  const all = data.tasks
  const byId = new Map(all.map((t) => [t.id, t]))
  const counts = leafCounts(all)
  const timeZone = useTimeZone()
  const today = ymd(useNow(), timeZone)
  const columns = stageColumns(all, data.stages, { today, timeZone })

  const [shownFolded, setShownFolded] = useState<ReadonlySet<StageId>>(new Set())
  const opened = (stage: StageResponse) => !stage.collapsed || shownFolded.has(stage.id)
  const order = columns
    .filter((c) => opened(c.stage))
    .map((c) => ({
      stage: c.stage.id,
      ids: c.cards.map((card) => card.task.id),
    }))
  const [activeId, setActiveId] = useState<TaskId | null>(null)
  const ids = order.flatMap((c) => c.ids)
  const tabId = activeId && ids.includes(activeId) ? activeId : (ids[0] ?? null)

  const { openId, setOpenId } = useTaskParam()
  const cards = useRowRefs()
  // The open card's column comes into sight, however far along the board it is.
  useEffect(() => {
    if (openId) cards.get(openId)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- about the card opening.
  }, [openId])
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
  /** A new stage for one node: logged, and its status left as it is (FR-040). */
  const move = (id: TaskId, to: StageId) => {
    if (byId.get(id)?.stageId === to) return
    setError(null)
    actions.patch(id, { stageId: to })
  }
  const [lifted, setLifted] = useState<TaskId | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const arrow = ARROWS.find((k) => k === e.key)
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-stage-card]')?.dataset
      .stageCard
    if (!arrow || !id || e.ctrlKey || e.metaKey || e.shiftKey) return
    const from = idFrom(taskId, id)
    if (e.altKey) {
      if (arrow === 'ArrowUp' || arrow === 'ArrowDown') return
      e.preventDefault()
      const here = data.stages.findIndex((s) => s.id === byId.get(from)?.stageId)
      const to = data.stages[here + (arrow === 'ArrowLeft' ? -1 : 1)]
      if (here >= 0 && to) move(from, to.id)
      return
    }
    e.preventDefault()
    const next = cardBeside(order, from, arrow)
    if (next === from) return
    setActiveId(next)
    cards.get(next)?.focus()
  }

  const stageOf = (over: unknown): StageId | null => {
    const id = typeof over === 'string' ? over : null
    return id && data.stages.some((s) => s.id === id) ? idFrom(stageIdSchema, id) : null
  }
  const card = lifted ? columns.flatMap((c) => c.cards).find((c) => c.task.id === lifted) : null
  const project = useEveryProject().data?.find((p) => p.id === projectId)
  const [editing, setEditing] = useState(false)

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
        {columnsSwitch}
        <span aria-hidden="true" className="flex-1" />
        <Button
          look="secondary"
          onClick={() => {
            // One sheet at a time on the right: the stages, or a task.
            setOpenId(null)
            setEditing(true)
          }}
        >
          <EditIcon size={14} aria-hidden="true" />
          Edit stages
        </Button>
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
        onDragStart={({ active }) => setLifted(idFrom(taskId, String(active.id)))}
        onDragCancel={() => setLifted(null)}
        onDragEnd={({ active, over }) => {
          setLifted(null)
          const to = stageOf(over?.id)
          if (to) move(idFrom(taskId, String(active.id)), to)
        }}
      >
        <div
          data-board="stage"
          onKeyDown={onKeyDown}
          // At least 240 a column (DES-001 v1.21), scrolling sideways in here, not the page.
          className="flex min-w-0 gap-3 max-md:flex-col md:h-[calc(100dvh-16rem)] md:min-h-96 md:overflow-x-auto md:pb-1"
        >
          {columns.map(({ stage, cards: list }) =>
            opened(stage) ? (
              <StageColumnView
                key={stage.id}
                projectId={projectId}
                stage={stage}
                count={list.length}
                onHide={
                  stage.collapsed
                    ? () =>
                        setShownFolded((now) => {
                          const next = new Set(now)
                          next.delete(stage.id)
                          return next
                        })
                    : undefined
                }
              >
                {list.map((c) => (
                  <StageCardView
                    key={c.task.id}
                    card={c}
                    counts={counts.get(c.task.id)}
                    organisations={data.organisations}
                    today={today}
                    timeZone={timeZone}
                    tabStop={c.task.id === tabId}
                    open={c.task.id === openId}
                    lifted={c.task.id === lifted}
                    cardRef={cards.ref(c.task.id)}
                    onOpen={() => setOpenId(c.task.id)}
                    onFocus={() => setActiveId(c.task.id)}
                  />
                ))}
              </StageColumnView>
            ) : (
              <StageStrip
                key={stage.id}
                stage={stage}
                count={list.length}
                onShow={() => setShownFolded((now) => new Set(now).add(stage.id))}
              />
            ),
          )}
        </div>
        <DragOverlay>
          {card && (
            <div className="flex cursor-grabbing flex-col gap-1 rounded-card bg-float px-2.5 py-2 shadow-float">
              <CardFace
                card={card}
                counts={counts.get(card.task.id)}
                organisations={data.organisations}
                today={today}
                timeZone={timeZone}
              />
            </div>
          )}
        </DragOverlay>
      </DndContext>
      {editing && project ? (
        <EditStages project={project} stages={data.stages} onClose={() => setEditing(false)} />
      ) : (
        pane.openTask && (
          <TaskDetail key={pane.openTask.id} task={pane.openTask} onClose={pane.close} />
        )
      )}
    </div>
  )
}

/** One stage's column: its dot, name, count and +, then its cards, the whole list, scrolling. */
function StageColumnView({
  projectId,
  stage,
  count,
  onHide,
  children,
}: {
  projectId: ProjectId
  stage: StageResponse
  count: number
  onHide: (() => void) | undefined
  children: ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id })
  const [adding, setAdding] = useState(false)
  return (
    <section
      ref={setNodeRef}
      aria-labelledby={`stage-${stage.id}`}
      data-stage-column={stage.id}
      // A stage with nothing in it gives its width to the ones that have (FR-058).
      className={`flex min-w-0 flex-col rounded-block border border-line bg-chrome ${
        count === 0 && !adding ? 'md:flex-[0_0_180px]' : 'flex-1 basis-0 md:min-w-60'
      } ${isOver ? OVER : ''}`}
    >
      <h3 className="flex h-10 shrink-0 items-center gap-2 pr-1.5 pl-3 text-ui">
        <i aria-hidden="true" className="size-2 shrink-0 rounded-full bg-muted" />
        <span id={`stage-${stage.id}`} className="min-w-0 truncate font-medium text-ink">
          {stage.name}
        </span>
        <span data-count className="text-meta text-subtle tabular-nums">
          {count}
        </span>
        <span aria-hidden="true" className="flex-1" />
        {onHide && (
          <button
            type="button"
            aria-label={`Fold ${stage.name}`}
            onClick={onHide}
            className={ICON_BUTTON}
          >
            <BarExpandIcon size={16} aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          aria-label={`New in ${stage.name}`}
          onClick={() => setAdding(true)}
          className={ICON_BUTTON}
        >
          <NewIcon size={16} aria-hidden="true" />
        </button>
      </h3>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {adding && (
          <NewAtStage projectId={projectId} stage={stage} onDone={() => setAdding(false)} />
        )}
        {children}
      </div>
    </section>
  )
}

/** A node typed in at a stage: at the top of the project, to do, at this stage (FR-058). */
function NewAtStage({
  projectId,
  stage,
  onDone,
}: {
  projectId: ProjectId
  stage: StageResponse
  onDone: () => void
}) {
  const title = useLineEntry()
  const send = title.sends((text) =>
    createTask({ projectId, title: text, parentId: null, stageId: stage.id }),
  )
  const create = useMutation({
    mutationFn: send,
    meta: { changes: ['task'], awaits: [projectTasksQuery(projectId).queryKey] },
    onSuccess: onDone,
  })
  return (
    <input
      autoFocus
      {...title.field({ onSubmit: create.mutate, busy: create.isPending, onCancel: onDone })}
      onBlur={() => {
        if (!title.value.trim()) onDone()
      }}
      aria-label={`New in ${stage.name}`}
      aria-invalid={create.isError ? true : undefined}
      placeholder="Name"
      className={`h-8 shrink-0 rounded-card border bg-panel px-2.5 text-ui text-ink placeholder:text-subtle ${
        create.isError ? 'border-stop' : 'border-line-strong'
      }`}
    />
  )
}

/** A stage folded by default (FR-040): a strip with its dot, count and name; a card drops on it. */
function StageStrip({
  stage,
  count,
  onShow,
}: {
  stage: StageResponse
  count: number
  onShow: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id })
  return (
    <button
      ref={setNodeRef}
      type="button"
      aria-expanded={false}
      aria-label={`${stage.name}, ${count}`}
      data-stage-strip={stage.id}
      onClick={onShow}
      className={`flex shrink-0 items-center gap-2 rounded-block border border-line bg-chrome text-muted hover:bg-hover max-md:h-10 max-md:px-3 md:w-10 md:flex-col md:py-3 ${
        isOver ? OVER : ''
      }`}
    >
      <i aria-hidden="true" className="size-2 shrink-0 rounded-full bg-subtle" />
      <span className="text-meta text-subtle tabular-nums">{count}</span>
      <span className="text-ui font-medium text-ink md:[writing-mode:vertical-rl]">
        {stage.name}
      </span>
    </button>
  )
}

type CardProps = {
  card: StageCard
  counts: { done: number; counted: number; backlog: number } | undefined
  organisations: ProjectTasks['organisations']
  today: string
  timeZone: string
}

/** One node's card, dragged by the pointer and opened by a click or Enter. */
function StageCardView({
  tabStop,
  open,
  lifted,
  cardRef,
  onOpen,
  onFocus,
  ...face
}: CardProps & {
  tabStop: boolean
  open: boolean
  lifted: boolean
  cardRef: (el: HTMLElement | null) => () => void
  onOpen: () => void
  onFocus: () => void
}) {
  const { listeners, setNodeRef } = useDraggable({ id: face.card.task.id })
  return (
    <button
      ref={(el) => {
        setNodeRef(el)
        const forget = cardRef(el)
        return () => {
          setNodeRef(null)
          forget()
        }
      }}
      {...listeners}
      type="button"
      tabIndex={tabStop ? 0 : -1}
      data-stage-card={face.card.task.id}
      aria-current={open ? 'true' : undefined}
      onClick={onOpen}
      onFocus={onFocus}
      className={`flex w-full shrink-0 flex-col gap-1 rounded-card border px-2.5 py-2 text-left outline-none ${
        lifted
          ? 'border-dashed border-line-strong bg-transparent *:invisible'
          : 'border-line bg-panel hover:border-line-strong focus-visible:border-transparent focus-visible:shadow-[0_0_0_2px_var(--color-task)] aria-[current]:border-transparent aria-[current]:shadow-[0_0_0_2px_var(--color-task)]'
      }`}
    >
      <CardFace {...face} />
    </button>
  )
}

/**
 * What a card says, only the lines it has data for (FR-058): the path above a node below the
 * top; the node's organisation, name and progress; the next leaf to do; how long it has been at
 * the stage, amber once that is two weeks, and its deadline. With nothing more than its name, one
 * line: name, days, progress.
 */
function CardFace({ card, counts, organisations, today, timeZone }: CardProps) {
  const { task, path, next, days } = card
  const orgOf = (id: TaskId) => organisations[id]?.map((o) => o.title)
  const top = path[0]
  const progress = counts ? (
    <span className="flex shrink-0 items-center gap-1.5">
      <ProgressSquare status={task.status} children={counts} />
      <span className="text-meta text-subtle tabular-nums">
        {counts.done}/{counts.counted}
      </span>
    </span>
  ) : (
    <span aria-hidden="true" className="flex shrink-0">
      <StatusMark status={task.status} size={16} />
    </span>
  )
  const waited =
    days === null ? null : (
      <span
        data-stage-days={days >= STALE_DAYS ? 'stale' : 'fresh'}
        title={`In this stage for ${days} day${days === 1 ? '' : 's'}`}
        className={`inline-flex shrink-0 items-center gap-1 text-meta tabular-nums ${
          days >= STALE_DAYS ? 'text-warn-t' : 'text-subtle'
        }`}
      >
        <InStageIcon size={12} aria-hidden="true" />
        {days}d
      </span>
    )
  const due = <DateChip task={task} today={today} timeZone={timeZone} />
  const hasDue = task.dueAt !== null && card.dueDay !== null
  const own = orgOf(task.id)
  const nameRow = (
    <span className="flex min-w-0 items-center gap-2">
      {own && <OrganisationMark names={own} />}
      <span data-stage-title className="min-w-0 flex-1 truncate text-ui font-medium text-ink">
        {task.title}
      </span>
      {/* With nothing else to say, the days sit on the name's line. */}
      {!top && !next && !hasDue && waited}
      {progress}
    </span>
  )
  return (
    <>
      {top && (
        <span data-stage-path className="flex min-w-0 items-center gap-2 text-meta text-muted">
          {orgOf(top.id) && <OrganisationMark names={orgOf(top.id)!} />}
          <span className="truncate">{path.map((t) => t.title).join(' / ')}</span>
        </span>
      )}
      {nameRow}
      {next && (
        <span data-stage-next className="flex min-w-0 items-center gap-2 text-ui text-muted">
          <span aria-hidden="true" className="flex shrink-0">
            <StatusMark status={next.status} size={16} />
          </span>
          <span className="truncate">{next.title}</span>
        </span>
      )}
      {(top || next || hasDue) && (waited || hasDue) && (
        <span className="flex min-w-0 items-center gap-2">
          {waited}
          <span aria-hidden="true" className="flex-1" />
          {due}
        </span>
      )}
    </>
  )
}
