import type { TaskId } from '@ctws/contracts'
import { useDraggable } from '@dnd-kit/core'
import { nearDay, shortDay } from '../../../../platform/time/dates'
import { FlagIcon, LockIcon, PLACE_ICON } from '../../../../platform/ui/icons'
import { waitingOn } from '../../logic/blockedLabel'
import type { BoardCard as Card } from '../../logic/board/boardColumns'
import { isFinished } from '../../logic/status'
import { treeDue } from '../../logic/tree/treeDue'
import { StatusMark } from '../StatusMark'
import { WaitingBadge } from '../TaskRowParts'

const CHIP =
  'inline-flex h-5.5 shrink-0 items-center gap-1.25 rounded-control px-2 text-meta font-medium whitespace-nowrap tabular-nums'
const DUE_TONE = {
  soon: 'bg-warn-bg text-warn-t',
  late: 'bg-stop-bg text-stop-t',
  quiet: 'bg-hover text-muted',
} as const

/**
 * A CARD ON THE BOARD (FR-057, artboard 21): the leaf's status and name, its deadline or else its
 * planned day, then the steps from its group's head and what it is waiting on. A click or Enter
 * opens it in the inspector; the pointer drags it to another column.
 */
export function BoardCard({
  card: { task, path },
  blockers,
  today,
  timeZone,
  tabStop,
  open,
  landing,
  cardRef,
  onOpen,
  onFocus,
}: {
  card: Card
  blockers: readonly { id: TaskId; title: string }[] | undefined
  today: string
  timeZone: string
  /** The board's one tab stop. */
  tabStop: boolean
  /** Its task is the one in the inspector. */
  open: boolean
  /** Being dragged: drawn as the dashed place it will land. */
  landing: boolean
  cardRef: (el: HTMLElement | null) => () => void
  onOpen: () => void
  onFocus: () => void
}) {
  const { listeners, setNodeRef } = useDraggable({ id: task.id })
  return (
    <li>
      {/* The pointer's listeners only: the keyboard moves a card with Alt and an arrow instead. */}
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
        type="button"
        tabIndex={tabStop ? 0 : -1}
        data-board-card={task.id}
        aria-current={open ? 'true' : undefined}
        onClick={onOpen}
        onFocus={onFocus}
        className={`flex w-full flex-col gap-1 rounded-card border px-2.5 py-2 text-left outline-none ${
          landing
            ? 'border-dashed border-line-strong bg-transparent *:invisible'
            : 'border-line bg-panel hover:border-line-strong focus-visible:border-transparent focus-visible:shadow-[0_0_0_2px_var(--color-task)] aria-[current]:border-transparent aria-[current]:shadow-[0_0_0_2px_var(--color-task)]'
        }`}
      >
        <CardFace card={{ task, path }} blockers={blockers} today={today} timeZone={timeZone} />
      </button>
    </li>
  )
}

/** What a card says, on the board and lifted under the pointer while it is dragged. */
export function CardFace({
  card: { task, path },
  blockers,
  today,
  timeZone,
}: {
  card: Card
  blockers: readonly { id: TaskId; title: string }[] | undefined
  today: string
  timeZone: string
}) {
  const settled = isFinished(task.status)
  const waiting = settled ? null : waitingOn(blockers)
  return (
    <>
      <span className="flex min-w-0 items-center gap-2">
        <span className="relative inline-grid shrink-0">
          <StatusMark status={task.status} size={16} />
          {waiting && <WaitingBadge bare />}
        </span>
        <span
          data-board-title
          className={`min-w-0 flex-1 truncate text-ui ${settled ? 'text-muted' : 'text-ink'}`}
        >
          {task.title}
        </span>
        {!settled && <DateChip task={task} today={today} timeZone={timeZone} />}
      </span>
      {path && (
        <span data-board-path className="truncate pl-6 text-meta text-subtle">
          {path}
        </span>
      )}
      {waiting && (
        <span
          data-board-waiting
          className="flex min-w-0 items-center gap-1 pl-6 text-meta text-warn-t"
        >
          <LockIcon size={12} aria-hidden="true" className="shrink-0" />
          <span className="truncate">{waiting}</span>
        </span>
      )}
    </>
  )
}

/** The deadline, coloured as in the tree's Due column; with none, the planned day, grey. */
function DateChip({
  task,
  today,
  timeZone,
}: {
  task: Card['task']
  today: string
  timeZone: string
}) {
  const due = treeDue({ ...task, waiting: false }, today, timeZone)
  if (due && due.tone !== 'waiting')
    return (
      <span data-board-due={due.tone} className={`${CHIP} ${DUE_TONE[due.tone]}`}>
        <span className="sr-only">Due </span>
        <FlagIcon size={12} aria-hidden="true" className="shrink-0" />
        {due.text}
      </span>
    )
  if (!task.scheduledOn) return null
  const Calendar = PLACE_ICON.calendar
  return (
    <span data-board-planned className={`${CHIP} bg-hover text-muted`}>
      <span className="sr-only">Planned </span>
      <Calendar size={12} aria-hidden="true" className="shrink-0" />
      {nearDay(task.scheduledOn, today) ?? shortDay(task.scheduledOn, today)}
    </span>
  )
}
