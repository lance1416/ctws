import { useSortable } from '@dnd-kit/sortable'
import type { TaskStatus } from '@ctws/contracts'
import type { KeyboardEvent } from 'react'
import type { FlatRow } from '../tree/flatten'
import { toggleDoneTarget, toggleStartTarget } from '../api/taskActions'
import { dateHints } from '../dueAt'
import {
  CHEVRON_PX,
  DUE_CELL,
  DueCell,
  HANDLE_PX,
  INDENT_PX,
  PLAN_CELL,
  PlanCell,
  ProjectRail,
  RAIL_GUTTER_PX,
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
  saved,
  tabStop,
  onFocus,
  onSetStatus,
  onToggle,
  onKeyDown,
  onOpen,
  onAddChild,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
  })
  const inactive = status === 'done' || status === 'cancelled'
  const hints = dateHints({ status, dueAt, scheduledOn })

  return (
    <li
      ref={setNodeRef}
      role="listitem"
      data-depth={row.depth}
      // A click on the row body opens the detail; the chevron and the handle are buttons with
      // their own jobs. A drag starts on the handle, so it never reaches here as a row click.
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('button')) onOpen()
      }}
      style={{
        // Pixel indentation is layout, not colour. The project rail sits BEFORE it, at x=0 on
        // every row whatever its depth: the rail carries project identity and nothing else.
        paddingLeft: RAIL_GUTTER_PX + (row.depth - 1) * INDENT_PX,
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        transition,
      }}
      className={`group relative flex min-h-8 cursor-pointer items-center rounded-md leading-snug hover:bg-surface-sunken ${isDragging ? 'bg-surface-sunken opacity-70' : ''}`}
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
        aria-label={`任务：${title}`}
        data-handle-id={row.id}
        {...attributes}
        {...listeners}
        // After the spread: dnd-kit's sortable attributes include a tabIndex of their own, and
        // letting it win would put every row back in the tab order.
        tabIndex={tabStop ? 0 : -1}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        style={{ width: HANDLE_PX }}
        className="flex h-8 shrink-0 cursor-grab touch-none items-center justify-center text-fg-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
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
          aria-label={row.collapsed ? '展开' : '折叠'}
          aria-expanded={!row.collapsed}
          onClick={onToggle}
          style={{ width: CHEVRON_PX }}
          className="flex h-8 shrink-0 items-center justify-center text-fg-muted hover:text-fg"
        >
          <Icon d={row.collapsed ? 'M6 3.5l4.5 4.5L6 12.5' : 'M3.5 6l4.5 4.5L12.5 6'} />
        </button>
      ) : (
        <span style={{ width: CHEVRON_PX }} className="shrink-0" aria-hidden="true" />
      )}
      <span className="mr-2 flex shrink-0 items-center">
        <StatusButton
          status={status}
          title={title}
          onClick={() => onSetStatus(toggleDoneTarget(status))}
        />
      </span>
      <span
        className={`min-w-0 flex-1 truncate py-1 text-[15px] ${
          status === 'in_progress' ? 'font-semibold' : ''
        } ${inactive ? 'text-fg-muted' : 'text-fg'} ${status === 'cancelled' ? 'line-through' : ''}`}
      >
        {title}
        {saved && <SavedMark />}
      </span>
      {/* The same two date columns the cross-project lists use, in the same order and at the same
          width. Everything after the title is a FIXED width, so each column starts at an identical
          x on every row of the tree however deeply indented the row is -- which is the whole
          reason the right-hand zone exists. Empty cells are still reserved: a column that moves
          when a row has no date is not a column. */}
      <DueCell due={hints.due} className={`ml-3 shrink-0 ${DUE_CELL}`} />
      <PlanCell text={hints.scheduled} className={`ml-3 shrink-0 ${PLAN_CELL}`} />
      <StartButton
        status={status}
        title={title}
        onClick={() => onSetStatus(toggleStartTarget(status))}
        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
      />
      {/* Mouse path to "add under this": the keyboard has Alt+Enter, so this stays out of the tab
          order. Shown on row hover; always shown where there is no hover. */}
      <button
        type="button"
        tabIndex={-1}
        aria-label={`添加子任务（${title}）`}
        onClick={onAddChild}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-fg-muted opacity-0 group-hover:opacity-100 hover:text-fg [@media(hover:none)]:opacity-100"
      >
        <Icon d="M8 3v10M3 8h10" />
      </button>
    </li>
  )
}
