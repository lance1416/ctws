import { useSortable } from '@dnd-kit/sortable'
import type { TaskStatus } from '@ctws/contracts'
import type { KeyboardEvent } from 'react'
import type { FlatRow } from '../tree/flatten'
import { toggleDoneTarget, toggleStartTarget } from '../api/taskActions'
import { blockedLabel } from '../blockedLabel'
import { capturedLabel, dateHints } from '../dueAt'
import { useTimeZone } from '../useMe'
import { leadIcon } from '../rowLead'
import {
  CHEVRON_PX,
  HANDLE_PX,
  INDENT_PX,
  LeadMark,
  NotesMark,
  ProjectRail,
  RAIL_GUTTER_PX,
  RowMeta,
  SavedMark,
} from './RowParts'
import { StartButton, StatusButton } from './StatusControls'

type Props = {
  row: FlatRow
  /** The project every row in this tree belongs to: the rail is one continuous spine here. */
  projectId: string
  title: string
  status: TaskStatus
  dueAt: string | null
  scheduledOn: string | null
  /**
   * Whether the task has notes. A row with notes and no date wears the notes glyph in the leading
   * slot; a row that has a date wears the date's glyph there and keeps the notes mark beside its
   * title, so adding a deadline never silently removes "there is something to read here".
   */
  hasNotes: boolean
  /** When this was captured, for the inbox's age line (D49). Every other list passes null. */
  capturedAt?: string | null
  /** This row's subtree, said in words (§7.3). Only a row with children gets one. */
  rollup?: string | null
  /** What is still in the way (D64). The row dims; it does not disappear. */
  blockedBy?: readonly { id: string; title: string }[] | undefined
  /**
   * Whether THIS LIST reserves the leading icon slot at all -- decided once for the whole tree,
   * never per row: a slot that exists on some rows and not others puts the first glyph of each row
   * at a different x, and these icons are the only column this layout has (spec §2). When no row
   * in the tree would carry an icon the slot is not rendered, and the title gets the width back.
   */
  leadSlot: boolean
  /** True for a moment after a save from the detail panel: the panel closed, this says it worked. */
  saved: boolean
  /**
   * The roving tabindex: exactly one row in the tree carries it, so the whole tree is ONE tab
   * stop and Tab leaves it in a single press no matter how many rows there are (D51). The arrow
   * keys and j/k move between rows; Tab stays unbound (WCAG 2.1.2).
   */
  tabStop: boolean
  onFocus: () => void
  onSetStatus: (status: TaskStatus) => void
  onToggle: () => void
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void
  onOpen: () => void
  /**
   * Shift+click toggles this row's membership of the selection (D61). Plain click still opens
   * the detail, so the one gesture people already use is untouched.
   */
  onToggleSelected?: () => void
  /** Whether this row is in the selection. */
  selected?: boolean
  onAddChild: () => void
}

// 16px canvas, 1.5px stroke, same as StatusMark: glyph characters like ▸ and ⋮⋮ differ in size
// and baseline from one OS font to the next.
function Icon({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  )
}

export function TaskRow({
  row,
  projectId,
  title,
  status,
  dueAt,
  scheduledOn,
  hasNotes,
  capturedAt = null,
  rollup = null,
  blockedBy,
  leadSlot,
  saved,
  tabStop,
  onFocus,
  onSetStatus,
  onToggle,
  onKeyDown,
  onOpen,
  onToggleSelected,
  selected = false,
  onAddChild,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
  })
  const inactive = status === 'done' || status === 'cancelled'
  // The ACCOUNT's zone, not the browser's: the server decides what is overdue in that zone, and a
  // row that said 「明天截止」 about a task the server had already filed under 逾期 would be the
  // page contradicting itself.
  const timeZone = useTimeZone()
  const hints = dateHints({ status, dueAt, scheduledOn }, timeZone)
  // ONE glyph for the row, chosen by what bites first (rowLead). The notes mark falls back to its
  // old place beside the title when a date has taken the slot.
  const icon = leadIcon({
    due: hints.due !== null,
    overdue: hints.due?.overdue === true,
    plan: hints.scheduled !== null,
    notes: hasNotes,
  })

  return (
    <li
      ref={setNodeRef}
      role="listitem"
      data-depth={row.depth}
      // A click on the row body opens the detail; the chevron and the handle are buttons with
      // their own jobs. A drag starts on the handle, so it never reaches here as a row click.
      aria-selected={onToggleSelected ? selected : undefined}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return
        // Shift picks rows instead of opening one. A plain click is unchanged, which is what
        // keeps the gesture people already use from becoming a mode.
        if (e.shiftKey && onToggleSelected) {
          e.preventDefault()
          onToggleSelected()
          return
        }
        onOpen()
      }}
      style={{
        // Pixel indentation is layout, not colour. The project rail sits BEFORE it, at x=0 on
        // every row whatever its depth: the rail carries project identity and nothing else.
        paddingLeft: RAIL_GUTTER_PX + (row.depth - 1) * INDENT_PX,
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        transition,
      }}
      // 44px for a row with nothing to say and 66px for one with a second line: the height is not
      // a class but the sum of what the row carries, so only the rows that carry information pay
      // for the extra line. `items-start`, because the glyphs belong to the FIRST line: every one
      // of them is 44px tall, so they centre on the title whether or not a second line follows it.
      // 44 = 10 + 24 + 10 and 66 = 10 + 24 + 22 + 10, from the typography spec's px pairs: the
      // title is 行标题 16/24 and the second line is 元信息 14/22. The 44 is unchanged from the
      // 15/20 title it replaces -- it was 12 + 20 + 8 then and the padding absorbed the two extra
      // pixels of leading -- so the workbench's single-line row metric survives the larger scale
      // exactly, and only the rows that already cost a second line got taller.
      className={`group relative flex min-h-11 cursor-pointer items-start rounded-lg hover:bg-surface-hover ${
        isDragging ? 'bg-surface-raised opacity-70' : ''
      } ${
        // A selected row wears the hover plane permanently plus an accent edge: the plane alone
        // would be indistinguishable from whatever the pointer happens to be over.
        selected ? 'bg-surface-hover shadow-[inset_2px_0_0_0_var(--color-accent)]' : ''
      } ${
        // BLOCKED ROWS DIM, THEY DO NOT DISAPPEAR (D64). 「列表丢任务就没法信」 is this tree's
        // oldest rule, and what is in the way is named on the line right under the title -- the
        // point is to answer "why not this one" without opening anything.
        blockedBy && blockedBy.length > 0 ? 'opacity-60' : ''
      }`}
    >
      <ProjectRail projectId={projectId} continuous />
      {/* One hairline per ancestor level, centred under that level's chevron column. Depth is
          carried by these guides, never by the rail. */}
      {Array.from({ length: row.depth - 1 }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 w-px bg-border-subtle"
          style={{ left: RAIL_GUTTER_PX + i * INDENT_PX + HANDLE_PX + CHEVRON_PX / 2 }}
        />
      ))}
      {/* The focus carrier and the pointer drag handle. Only the pointer sensor is registered,
          so `listeners` is just onPointerDown and our own onKeyDown owns the keyboard. Invisible
          at rest, shown on hover and on keyboard focus; always shown where there is no hover. */}
      <button
        type="button"
        aria-label={`Task: ${title}`}
        data-handle-id={row.id}
        {...attributes}
        {...listeners}
        // After the spread: dnd-kit's sortable attributes include a tabIndex of their own, and
        // letting it win would put every row back in the tab order.
        tabIndex={tabStop ? 0 : -1}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        style={{ width: HANDLE_PX }}
        className="flex h-11 shrink-0 cursor-grab touch-none items-center justify-center text-fg-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
      >
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="currentColor">
          {[5.5, 10.5].flatMap((x) =>
            [4, 8, 12].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.1" />),
          )}
        </svg>
      </button>
      {/* Gated on hasChildren, not on collapsed: a stale collapsed id for a row that has since
          become a leaf yields collapsed: true with no children, and must not show a chevron. */}
      {row.hasChildren ? (
        <button
          type="button"
          aria-label={row.collapsed ? 'Expand' : 'Collapse'}
          aria-expanded={!row.collapsed}
          onClick={onToggle}
          style={{ width: CHEVRON_PX }}
          className="flex h-11 shrink-0 items-center justify-center text-fg-muted hover:text-fg"
        >
          <Icon d={row.collapsed ? 'M6 3.5l4.5 4.5L6 12.5' : 'M3.5 6l4.5 4.5L12.5 6'} />
        </button>
      ) : (
        <span style={{ width: CHEVRON_PX }} className="shrink-0" aria-hidden="true" />
      )}
      <span className="mr-2 flex h-11 shrink-0 items-center">
        <StatusButton
          status={status}
          title={title}
          onClick={() => onSetStatus(toggleDoneTarget(status))}
        />
      </span>
      {/* THE LEADING ICON SLOT: 1.5rem, fixed, reserved for the whole list or not at all, so every
          row's glyph lands at one x however deeply the row is indented. It holds a PURE ICON and
          never text (spec §2) -- the words are on the second line, where they fit whole. */}
      {leadSlot && (
        <span
          data-lead-slot
          className="mr-1 flex h-11 w-6 shrink-0 items-center justify-center"
          aria-hidden={icon === null ? true : undefined}
        >
          {icon && <LeadMark icon={icon} />}
        </span>
      )}
      {/* The title owns the whole first line: there is nothing to its right to reserve width for
          any more. Under it, the dates in full words -- and NOT a breadcrumb: in a project tree the
          project is known and the hierarchy is visible from the indentation, so writing it again
          would spend vertical space on zero information (spec §2).
          `py-2.5` around a 24px title line puts its centre at 22px, which is the centre of the
          44px glyphs beside it, and makes the row exactly 44px with no second line and 66px with
          one. Symmetric now, where the old 15/20 title needed `pt-3 pb-2` to land on 22. */}
      <span data-row-cell className="flex min-w-0 flex-1 flex-col py-2.5">
        <span className="flex min-w-0 items-center">
          <span
            data-row-title
            className={`truncate text-base ${
              status === 'in_progress' ? 'font-semibold' : ''
            } ${inactive ? 'text-fg-muted' : 'text-fg'} ${status === 'cancelled' ? 'line-through' : ''}`}
          >
            {title}
            {saved && <SavedMark />}
          </span>
          {/* There is something to read in this one, and a date took the leading slot. `shrink-0`,
              so it costs the row no height and reserves no width on the rows without it. */}
          {hasNotes && icon !== 'notes' && (
            <span className="ml-2 flex shrink-0 items-center text-fg-subtle">
              <NotesMark />
            </span>
          )}
        </span>
        <RowMeta
          due={hints.due}
          plan={hints.scheduled}
          age={capturedAt ? capturedLabel(capturedAt, timeZone) : null}
          rollup={rollup}
          blocked={blockedLabel(blockedBy)}
        />
      </span>
      {/* THE TWO HOVER CONTROLS RESERVE NO WIDTH. They are invisible until the row is hovered, so
          holding 64px of every row for them was the last thing taking width off the titles: with
          them in the flow the user's own long title still did not fit the 734px panel the detail
          column leaves (spec §6), and it does with 48px of slack now. Over the page rather than in
          it, they appear on the hovered row's own background, so a truncated title's ellipsis is
          covered rather than jostled -- the row does not reflow when the pointer arrives.
          `static` again where there is no hover, since there they are shown permanently and must
          not sit on top of the text.
          Pinned to the FIRST line (`top-0 h-11`), so a row with a second line does not drag them
          down to its middle. */}
      <span className="absolute top-0 right-1 flex h-11 shrink-0 items-center bg-surface-hover opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:static [@media(hover:none)]:bg-transparent [@media(hover:none)]:opacity-100">
        <StartButton
          status={status}
          title={title}
          onClick={() => onSetStatus(toggleStartTarget(status))}
        />
        {/* Mouse path to "add under this": the keyboard has Alt+Enter, so this stays out of the tab
          order. Shown on row hover; always shown where there is no hover. */}
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Add a subtask to “${title}”`}
          onClick={onAddChild}
          className="flex h-9 w-8 shrink-0 items-center justify-center rounded-lg text-fg-muted hover:text-fg"
        >
          <Icon d="M8 3v10M3 8h10" />
        </button>
      </span>
    </li>
  )
}
