import { isFinished, type StatusMove, toggleDoneTarget, toggleStartTarget } from '../logic/status'
import { CollapseIcon, ExpandIcon, FlagIcon, LockIcon, NewIcon } from '../../../platform/ui/icons'
import { useSortable } from '@dnd-kit/sortable'
import type { ChildCounts, TaskId, TaskResponse } from '@ctws/contracts'
import type { KeyboardEvent } from 'react'
import type { FlatRow } from '../logic/tree/flatten'
import { blockedLabel } from '../logic/blockedLabel'
import { ymd } from '../../../platform/time/dates'
import { capturedLabel } from '../logic/dueDates'
import { treeDue, type TreeDue } from '../logic/tree/treeDue'
import { useTimeZone } from '../../../shell/auth'
import {
  INDENT_PX,
  OrganisationMark,
  SavedMark,
  TREE_ROW,
  WIDE_ONLY,
  WaitingBadge,
  opensOnClick,
} from './TaskRowParts'
import { Grip } from '../../../platform/ui/Grip'
import { StageLabel } from '../../../platform/ui/StageLabel'
import { ProgressSquare } from './ProgressSquare'
import { StartButton, StatusButton } from './StatusControls'
import { useNow } from '../../../platform/time/useNow'

type Props = {
  row: FlatRow
  /** What the row draws; missing only for the moment a moved row's list is read again. */
  task: TaskResponse | undefined
  /** Whether the row says how long ago it was captured: only the inbox's do. */
  aged: boolean
  /** A parent's leaves, for its square and its "1/4"; a leaf has none. */
  counts: ChildCounts | undefined
  /** The stage it has reached, and whether that stage is one folded away by default. */
  stage: { name: string; quiet: boolean } | null
  /** What is still in the way: the Due column says Waiting while there is any. */
  blockedBy: readonly { id: TaskId; title: string }[] | undefined
  /** The organisations it is linked to: a mark after its name says which (FR-047). */
  organisations: readonly { id: string; title: string }[] | undefined
  /**
   * `saved` is true for a moment after a save from the pane: the row says it worked. `tabStop` is
   * the roving tabindex: one row carries it, so the tree is one tab stop and Tab leaves it.
   */
  state: { saved: boolean; selected: boolean; tabStop: boolean }
  /** The handle's ref: the row's focus carrier, which the tree moves focus to. */
  handleRef: (el: HTMLElement | null) => () => void
  on: RowActions
}

/** What a row's parts ask the tree to do. Shift+click toggles the selection; a click opens. */
type RowActions = {
  focus: () => void
  setStatus: (status: StatusMove) => void
  toggle: () => void
  keyDown: (e: KeyboardEvent<HTMLButtonElement>) => void
  open: () => void
  toggleSelected: () => void
  addChild: () => void
  /** The inbox's rows: picks a project to move it to (FR-059). */
  moveTo?: (() => void) | undefined
}

/**
 * ONE ROW OF THE TREE (FR-054, artboard 8), in its four columns: the name, behind its fold and its
 * status (a leaf) or its progress square (a parent); the stage; a parent's progress; the deadline.
 */
export function TaskRow({
  row,
  task,
  aged,
  counts,
  stage,
  blockedBy,
  organisations,
  state: { saved, selected, tabStop },
  handleRef,
  on,
}: Props) {
  const title = task?.title ?? ''
  const status = task?.status ?? 'todo'
  const dueAt = task?.dueAt ?? null
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
  })
  const settled = isFinished(status)
  const blocked = blockedLabel(blockedBy)
  // The account's zone, not the browser's: the server decides what is overdue in that zone.
  const timeZone = useTimeZone()
  const now = useNow()
  const today = ymd(now, timeZone)
  const due = treeDue({ dueAt, status, waiting: blocked !== null }, today, timeZone)
  // The inbox's rows say their age while no date says more (STORY-016).
  const age =
    aged && !dueAt && !task?.scheduledOn && task
      ? capturedLabel(task.createdAt, timeZone, now)
      : null

  return (
    <li
      ref={setNodeRef}
      role="listitem"
      data-depth={row.depth}
      // A click on the row opens the detail; the fold, the handle and the controls are buttons
      // with their own jobs. A drag starts on the handle, so it never reaches here as a click.
      onClick={(e) => {
        if (!opensOnClick(e)) return
        // Shift picks rows instead of opening one.
        if (e.shiftKey) {
          e.preventDefault()
          on.toggleSelected()
          return
        }
        on.open()
      }}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        transition,
      }}
      className={`group relative cursor-pointer ${TREE_ROW} hover:bg-hover ${
        isDragging ? 'bg-float opacity-70' : ''
      } ${
        // A selected row wears the select layer plus an ink edge: a layer alone would be hard to
        // tell from whatever the pointer happens to be over.
        selected ? 'bg-select shadow-[inset_2px_0_0_0_var(--color-ink)]' : ''
      }`}
    >
      {/* The focus carrier and drag handle, in the row's left gutter. Only the pointer sensor is
          registered, so `listeners` is just onPointerDown and our own onKeyDown owns the keys. */}
      <button
        type="button"
        ref={handleRef}
        aria-label={`Task: ${title}`}
        data-handle-id={row.id}
        {...attributes}
        {...listeners}
        // After the spread: dnd-kit's sortable attributes include a tabIndex of their own, and
        // letting it win would put every row back in the tab order.
        tabIndex={tabStop ? 0 : -1}
        onFocus={on.focus}
        onKeyDown={on.keyDown}
        className="absolute inset-y-0 left-0 flex w-3 cursor-grab touch-none items-center justify-center text-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
      >
        <Grip />
      </button>

      <span
        data-row-cell
        className="flex min-w-0 items-center gap-1.5"
        style={{ paddingLeft: (row.depth - 1) * INDENT_PX }}
      >
        {/* Gated on hasChildren, not on collapsed: a stale collapsed id for a row that has since
            become a leaf yields collapsed: true with no children, and must not show a fold. */}
        {row.hasChildren ? (
          <button
            type="button"
            aria-label={row.collapsed ? 'Expand' : 'Collapse'}
            aria-expanded={!row.collapsed}
            onClick={on.toggle}
            className="-my-2 -ml-1 flex h-9 w-5 shrink-0 items-center justify-center text-muted hover:text-ink"
          >
            {row.collapsed ? <CollapseIcon size={14} /> : <ExpandIcon size={14} />}
          </button>
        ) : (
          <span aria-hidden="true" className="-ml-1 w-5 shrink-0" />
        )}
        {counts ? (
          <span className="flex shrink-0">
            <ProgressSquare status={status} children={counts} />
          </span>
        ) : (
          <span className="relative -m-1.5 flex shrink-0">
            <StatusButton
              status={status}
              title={title}
              size={16}
              onClick={() => on.setStatus(toggleDoneTarget(status))}
            />
            {blocked && !settled && <WaitingBadge />}
          </span>
        )}
        <span
          data-row-title
          title={blocked ?? undefined}
          className={`ml-1 truncate text-ui ${counts ? 'font-medium' : ''} ${
            settled ? 'text-muted' : 'text-ink'
          } ${status === 'cancelled' ? 'line-through' : ''}`}
        >
          {title}
        </span>
        {organisations && organisations.length > 0 && (
          <span className="ml-1.5 flex">
            <OrganisationMark names={organisations.map((o) => o.title)} />
          </span>
        )}
        {saved && <SavedMark />}
        {/* The select layer is drawn; this says it. A list item cannot carry aria-selected. */}
        {selected && <span className="sr-only">Selected</span>}
        {blocked && <span className="sr-only">, {blocked}</span>}
      </span>

      <span data-row-stage className={`flex min-w-0 ${WIDE_ONLY}`}>
        {stage && <StageLabel name={stage.name} quiet={stage.quiet} />}
      </span>

      <span data-row-progress className={`flex min-w-0 items-center gap-2 ${WIDE_ONLY}`}>
        {counts && (
          <>
            <span aria-hidden="true" className="h-1 min-w-0 flex-1 rounded-full bg-hover">
              <span
                className="block h-full rounded-full bg-go"
                style={{
                  width: `${counts.counted === 0 ? 0 : (counts.done / counts.counted) * 100}%`,
                }}
              />
            </span>
            <span className="text-meta text-muted tabular-nums">
              <span className="sr-only">Done </span>
              {counts.done}/{counts.counted}
            </span>
          </>
        )}
      </span>

      <span data-row-due-cell className="flex min-w-0">
        {due ? (
          <DueLabel due={due} />
        ) : (
          age && (
            <span data-row-age className="truncate text-meta text-subtle">
              {age}
            </span>
          )
        )}
      </span>

      {/* The hover controls in their own last column, after the due day (I-06). On a phone,
          which has no room for it, they sit over the row's end on an opaque ground. Without
          hover they always show. */}
      <span
        data-row-acts
        className="flex h-9 items-center justify-end opacity-0 group-hover:opacity-100 focus-within:opacity-100 max-md:absolute max-md:top-0 max-md:right-2 max-md:bg-panel max-md:shadow-[inset_0_0_0_100vmax_var(--color-hover)] [@media(hover:none)]:opacity-100"
      >
        {on.moveTo && (
          // The pointer's way; the keyboard moves it from the inspector's edit, as any task.
          <button
            type="button"
            tabIndex={-1}
            aria-label={`Move “${title}” to…`}
            onClick={on.moveTo}
            className="h-7 shrink-0 rounded-control px-2 text-meta text-muted hover:bg-hover hover:text-ink"
          >
            Move to…
          </button>
        )}
        <StartButton
          status={status}
          title={title}
          onClick={() => on.setStatus(toggleStartTarget(status))}
        />
        {/* The pointer's way to add a subtask; the keyboard has Alt+Enter. */}
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Add a subtask to “${title}”`}
          onClick={on.addChild}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-muted hover:text-ink"
        >
          <NewIcon size={16} />
        </button>
      </span>
    </li>
  )
}

const DUE_TONE = {
  soon: 'h-5.5 rounded-control bg-warn-bg px-2 font-medium text-warn-t',
  late: 'h-5.5 rounded-control bg-stop-bg px-2 font-medium text-stop-t',
  quiet: 'text-muted',
  waiting: 'font-medium text-warn-t',
} as const

/**
 * The Due column: within the week a flag on amber, missed one on red, further off grey words
 * (FR-054); Waiting, behind a lock, for a leaf something unfinished holds up.
 */
function DueLabel({ due }: { due: TreeDue }) {
  return (
    <span
      data-row-due={due.tone}
      className={`inline-flex min-w-0 items-center gap-1 text-meta whitespace-nowrap tabular-nums ${DUE_TONE[due.tone]}`}
    >
      <span className="sr-only">{due.tone === 'waiting' ? '' : 'Due '}</span>
      {(due.tone === 'soon' || due.tone === 'late') && (
        <FlagIcon size={12} aria-hidden="true" className="shrink-0" />
      )}
      {due.tone === 'waiting' && <LockIcon size={12} aria-hidden="true" className="shrink-0" />}
      {due.text}
    </span>
  )
}
