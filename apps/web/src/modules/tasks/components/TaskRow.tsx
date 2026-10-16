import { isFinished, toggleDoneTarget, toggleStartTarget } from '../logic/status'
import { Icon } from '../../../platform/ui/icons'
import { useSortable } from '@dnd-kit/sortable'
import { type ProjectId, type TaskId, type TaskResponse, type TaskStatus } from '@ctws/contracts'
import type { KeyboardEvent } from 'react'
import type { FlatRow } from '../logic/tree/flatten'
import { blockedLabel } from '../logic/blockedLabel'
import { ymd } from '../../../platform/time/dates'
import { capturedLabel, lateNote } from '../logic/dueDates'
import { useTimeZone } from '../../../shell/auth'
import { leadFor, ProjectRail, ROW_BODY, RowLead } from '../../../shell/rows'
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
  /** What the row draws; missing only for the moment a moved row's list is read again. */
  task: TaskResponse | undefined
  /** Whether the row says how long ago it was captured: only the inbox's do. */
  aged: boolean
  /** This row's subtree, said in words. Only a row with children gets one. */
  rollup: string | null
  /** What is still in the way. The row dims; it does not disappear. */
  blockedBy: readonly { id: TaskId; title: string }[] | undefined
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
  setStatus: (status: TaskStatus) => void
  toggle: () => void
  keyDown: (e: KeyboardEvent<HTMLButtonElement>) => void
  open: () => void
  toggleSelected: () => void
  addChild: () => void
}

export function TaskRow({
  row,
  projectId,
  task,
  aged,
  rollup,
  blockedBy,
  state: { saved, selected, tabStop },
  handleRef,
  on,
}: Props) {
  const title = task?.title ?? ''
  const status = task?.status ?? 'todo'
  const dueAt = task?.dueAt ?? null
  const scheduledOn = task?.scheduledOn ?? null
  const hasNotes = (task?.notes ?? '') !== ''
  const capturedAt = aged ? (task?.createdAt ?? null) : null
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
          on.toggleSelected()
          return
        }
        on.open()
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
        className={`${ROW_BODY} relative min-h-11 items-start pr-2 group-hover:bg-hover ${
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
            onClick={on.toggle}
            style={{ width: CHEVRON_PX }}
            className="flex h-11 shrink-0 items-center justify-center text-ink-muted hover:text-ink"
          >
            <Icon glyph={row.collapsed ? 'treeFolded' : 'treeOpen'} size={16} />
          </button>
        ) : (
          <span style={{ width: CHEVRON_PX }} className="shrink-0" aria-hidden="true" />
        )}
        <span className="mr-2 flex h-11 shrink-0 items-center">
          <StatusButton
            status={status}
            title={title}
            onClick={() => on.setStatus(toggleDoneTarget(status))}
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
            onClick={() => on.setStatus(toggleStartTarget(status))}
          />
          {/* The pointer's way to add a subtask; the keyboard has Alt+Enter. */}
          <button
            type="button"
            tabIndex={-1}
            aria-label={`Add a subtask to “${title}”`}
            onClick={on.addChild}
            className="flex h-9 w-8 shrink-0 items-center justify-center rounded-md text-ink-muted hover:text-ink"
          >
            <Icon glyph="plusLong" size={16} />
          </button>
        </span>
      </div>
    </li>
  )
}
