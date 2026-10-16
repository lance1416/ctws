import { isFinished } from '../status'
import { useSortable } from '@dnd-kit/sortable'
import { type TaskStatus, type ProjectId, type TaskId } from '@ctws/contracts'
import type { KeyboardEvent } from 'react'
import type { FlatRow } from '../tree/flatten'
import { toggleDoneTarget, toggleStartTarget } from '../api/taskActions'
import { blockedLabel } from '../blockedLabel'
import { ymd } from '../../../platform/time/dates'
import { capturedLabel, lateNote } from '../dueDates'
import { useTimeZone } from '../../../shell/auth/useMe'
import { leadFor } from '../../../shell/rows/leads'
import { RowLead } from '../../../shell/rows/RowLead'
import { BODY_GUTTER, ProjectRail } from '../../../shell/rows/RowParts'
import {
  gutterPlus,
  CHEVRON_PX,
  HANDLE_PX,
  INDENT_PX,
  NotesMark,
  opensOnClick,
  OVER_ROW,
  RowMeta,
  RowNote,
  SavedMark,
} from './TaskRowParts'
import { StartButton, StatusButton } from './StatusControls'
import { useNow } from '../../../platform/time/useNow'

type Props = {
  row: FlatRow
  /** The project every row in this tree belongs to: the rail is one continuous spine here. */
  projectId: ProjectId
  title: string
  status: TaskStatus
  dueAt: string | null
  scheduledOn: string | null
  /** Whether the task has notes: the notes mark sits beside the title. */
  hasNotes: boolean
  /** When this was captured, for the inbox's age line. Every other list passes null. */
  capturedAt: string | null
  /** This row's subtree, said in words. Only a row with children gets one. */
  rollup: string | null
  /** What is still in the way. The row dims; it does not disappear. */
  blockedBy: readonly { id: TaskId; title: string }[] | undefined
  /** True for a moment after a save from the pane: the row says it worked. */
  saved: boolean
  /** The roving tabindex: one row carries it, so the tree is one tab stop and Tab leaves it. */
  tabStop: boolean
  onFocus: () => void
  onSetStatus: (status: TaskStatus) => void
  onToggle: () => void
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void
  onOpen: () => void
  /** Shift+click toggles this row in the selection; a plain click still opens the detail. */
  onToggleSelected: () => void
  selected: boolean
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
  capturedAt,
  rollup,
  blockedBy,
  saved,
  tabStop,
  onFocus,
  onSetStatus,
  onToggle,
  onKeyDown,
  onOpen,
  onToggleSelected,
  selected,
  onAddChild,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
  })
  const inactive = isFinished(status)
  // The account's zone, not the browser's: the server decides what is overdue in that zone.
  const timeZone = useTimeZone()
  const now = useNow()
  const late = lateNote({ status, dueAt }, timeZone, now)
  // A settled task's dates no longer tell the reader anything: its margin is empty.
  const lead = inactive ? null : leadFor({ dueAt, scheduledOn }, ymd(now, timeZone), timeZone)

  return (
    <li
      ref={setNodeRef}
      role="listitem"
      data-depth={row.depth}
      // A click on the row body opens the detail; the chevron and the handle are buttons with
      // their own jobs. A drag starts on the handle, so it never reaches here as a row click.
      onClick={(e) => {
        if (!opensOnClick(e)) return
        // Shift picks rows instead of opening one.
        if (e.shiftKey) {
          e.preventDefault()
          onToggleSelected()
          return
        }
        onOpen()
      }}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        transition,
      }}
      // The margin, the thread, then the body; `items-stretch` so the thread runs the row's height.
      className={`group relative flex cursor-pointer items-stretch ${isDragging ? 'opacity-70' : ''} ${
        // Blocked rows dim but stay; what is in the way is named under the title.
        blockedBy && blockedBy.length > 0 ? 'opacity-60' : ''
      }`}
    >
      <RowLead lead={lead} />
      <ProjectRail projectId={projectId} />
      {/* The body is the only part indented, hovered and selected. `items-start`: each glyph is
          44px tall, so it centres on the title whether or not a second line follows. */}
      <div
        style={{ paddingLeft: gutterPlus((row.depth - 1) * INDENT_PX) }}
        className={`relative flex min-h-11 min-w-0 flex-1 items-start pr-2 group-hover:bg-hover ${BODY_GUTTER} ${
          isDragging ? 'bg-float' : ''
        } ${
          // A selected row wears the select layer plus an ink edge: a layer alone would be hard to
          // tell from whatever the pointer happens to be over.
          selected ? 'bg-select shadow-[inset_2px_0_0_0_var(--color-ink)]' : ''
        }`}
      >
        {/* One hairline per ancestor level, centred under that level's chevron column. Depth is
            carried by these guides, never by the thread. */}
        {Array.from({ length: row.depth - 1 }, (_, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 w-px bg-rule"
            style={{ left: gutterPlus(i * INDENT_PX + HANDLE_PX + CHEVRON_PX / 2) }}
          />
        ))}
        {/* The focus carrier and drag handle. Only the pointer sensor is registered, so
            `listeners` is just onPointerDown and our own onKeyDown owns the keyboard. */}
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
          className="flex h-11 shrink-0 cursor-grab touch-none items-center justify-center text-ink-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
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
            className="flex h-11 shrink-0 items-center justify-center text-ink-muted hover:text-ink"
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
        {/* Under the title: what it waits on, its children, or its age; never a breadcrumb. */}
        <span data-row-cell className="flex min-w-0 flex-1 flex-col py-2.5">
          <span className="flex min-w-0 items-center">
            <span
              data-row-title
              className={`truncate text-base ${
                status === 'in_progress' ? 'font-semibold' : ''
              } ${inactive ? 'text-ink-muted' : 'text-ink'} ${status === 'cancelled' ? 'line-through' : ''}`}
            >
              {title}
              {saved && <SavedMark />}
            </span>
            {/* The select layer is drawn; this says it. A list item cannot carry aria-selected. */}
            {selected && <span className="sr-only">Selected</span>}
            {hasNotes && (
              <span className="ml-2 flex shrink-0 items-center text-ink-subtle">
                <NotesMark />
              </span>
            )}
          </span>
          <RowMeta
            // An age only while there is no date: a date says more.
            age={
              capturedAt && !dueAt && !scheduledOn ? capturedLabel(capturedAt, timeZone, now) : null
            }
            rollup={rollup}
            blocked={blockedLabel(blockedBy)}
          />
        </span>
        {/* How late, on the right: the margin says which day it was due. */}
        {late && <RowNote>{late}</RowNote>}
        {/* The hover controls sit over the body (`OVER_ROW` is opaque), reserving no width.
            Without hover they always show, so they go `static` and stay off the text. */}
        <span
          className={`absolute top-0 right-1 flex h-11 shrink-0 items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:static [@media(hover:none)]:bg-transparent [@media(hover:none)]:opacity-100 [@media(hover:none)]:shadow-none ${OVER_ROW}`}
        >
          <StartButton
            status={status}
            title={title}
            onClick={() => onSetStatus(toggleStartTarget(status))}
          />
          {/* The pointer's way to add a subtask; the keyboard has Alt+Enter. */}
          <button
            type="button"
            tabIndex={-1}
            aria-label={`Add a subtask to “${title}”`}
            onClick={onAddChild}
            className="flex h-9 w-8 shrink-0 items-center justify-center rounded-md text-ink-muted hover:text-ink"
          >
            <Icon d="M8 3v10M3 8h10" />
          </button>
        </span>
      </div>
    </li>
  )
}
