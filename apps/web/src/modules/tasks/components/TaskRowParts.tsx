import { Fragment, type MouseEvent, type ReactNode } from 'react'

/** The row parts only the task lists use; the shared anatomy is `shell/rows/RowParts`. */

/** A click on a row opens it unless it landed on one of the row's own buttons. */
export const opensOnClick = (e: MouseEvent) => !(e.target as HTMLElement).closest('button')

/** Tree geometry, shared by the tree row and the inline new-task input so they stay aligned. */
export const INDENT_PX = 20
export const HANDLE_PX = 16
export const CHEVRON_PX = 20

/**
 * THE GROUND UNDER CONTROLS THAT APPEAR OVER A HOVERED ROW'S END: the sheet, opaque, with the
 * hover layer painted on it, so it matches the hovered row around it and HIDES the end of the
 * title beneath. The hover layer alone is 8% ink: through it the title's last words were drawn
 * under the buttons, both legible at once and neither. Rows that take this live on the sheet.
 */
export const OVER_ROW = 'bg-sheet shadow-[inset_0_0_0_100vmax_var(--color-hover)]'
export const gutterPlus = (px: number) => `calc(var(--gutter) + ${px}px)`

/**
 * How wide Done's list is. Its rows carry nothing on the right, so at 1440 an unbounded one puts
 * the end of a short title a long way from the margin it hangs on.
 */
export const DONE_LIST_MEASURE = 'max-w-[36rem]'

/**
 * THE GLYPH BOX the date marks share: one 12-unit grid, one stroke weight, one size. Two marks
 * that differ by SILHOUETTE have to be drawn on the same canvas, or they differ by weight and
 * scale as well and the silhouette stops being the thing telling them apart.
 */
function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 12 12"
      width="14"
      height="14"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      {children}
    </svg>
  )
}

/**
 * A deadline's glyph: a flag on a pole. Upright, with a vertical silhouette.
 *
 * The two date semantics must not differ by HUE ALONE. They differ in three
 * channels: the words ("due" against "planned"), the colour family (warm against cool) and -- this
 * -- the shape. A flag is a line you must not cross; it is filled once the line has been crossed.
 */
export function DeadlineMark({ filled }: { filled: boolean }) {
  return (
    <Glyph>
      <path d="M3.25 1.5V11" />
      <path d="M3.25 2.6L9.75 4.4 3.25 6.2z" fill={filled ? 'currentColor' : 'none'} />
    </Glyph>
  )
}

/**
 * A plan's glyph: a tick on a timeline. Deliberately HORIZONTAL, so in a grey screenshot (or to a
 * colourblind reader) a plan and a deadline are told apart by silhouette alone.
 */
export function PlanMark() {
  return (
    <Glyph>
      <path d="M1 8.75h10" />
      <path d="M6 4.25v4.5" />
    </Glyph>
  )
}

/**
 * A notes glyph: three ruled lines, the shortest last. Prose, at a glance, and nothing like either
 * date glyph (an upright flag, a wide timeline tick) it shares the slot with.
 */
export function NotesMark() {
  return (
    <svg
      aria-hidden="true"
      data-notes-mark
      viewBox="0 0 14 14"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      className="shrink-0"
    >
      <path d="M2.5 4h9" />
      <path d="M2.5 7h9" />
      <path d="M2.5 10h5" />
    </svg>
  )
}

/**
 * THE SECOND LINE: where a row came from, in words -- never when; that is the margin's.
 *
 * It renders NOTHING when there is nothing to say, so a row with no breadcrumb stays one line
 * (44px) and only the rows that carry information pay for the second one (66px).
 *
 * No alignment, no truncated phrases: this line is read, not scanned. Each phrase is kept whole
 * (`whitespace-nowrap` per part) so a narrow panel breaks the line BETWEEN phrases.
 */
export function RowMeta({
  breadcrumb = null,
  age = null,
  rollup = null,
  blocked = null,
}: {
  /** The project (and parent) a cross-project list shows. The tree passes none: the project is
   *  known there and the hierarchy is visible from the indentation. */
  breadcrumb?: string | null
  /**
   * HOW LONG THIS HAS BEEN SITTING HERE, worded: "Captured 3 days ago". The inbox is the only list
   * that passes one, and it is dropped when the line has anything else to say.
   */
  age?: string | null
  /** "60% · 2 in progress · 1 overdue" for a row that HAS CHILDREN. */
  rollup?: string | null
  /**
   * "Waiting on <task>" -- what this row is waiting for, named. FIRST ON THE LINE, and never
   * dropped: it says whether the row can be worked on at all.
   */
  blocked?: string | null
}) {
  const parts = [
    blocked ? (
      <span key="blocked" data-row-blocked className="whitespace-nowrap text-ink-subtle">
        {blocked}
      </span>
    ) : null,
    breadcrumb ? (
      <span key="crumb" data-row-crumb className="min-w-0 truncate">
        {breadcrumb}
      </span>
    ) : null,
    rollup ? (
      <span key="rollup" data-row-rollup className="whitespace-nowrap tabular-nums">
        {rollup}
      </span>
    ) : null,
    // Only on a line that would otherwise be empty, a step quieter: an age is the one phrase here
    // that nobody chose.
    age && !breadcrumb && !rollup && !blocked ? (
      <span key="age" data-row-age className="whitespace-nowrap text-ink-subtle">
        {age}
      </span>
    ) : null,
  ].filter((part) => part !== null)
  if (parts.length === 0) return null
  return (
    // META: 14/22, weight 400, from the type scale.
    <span
      data-row-meta
      className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-sm text-ink-muted"
    >
      {parts.map((part, i) => (
        // The separator travels WITH the phrase it follows, inside one flex item: loose, it can be
        // pushed onto the next line and start it with a stray ·. Hidden from assistive technology.
        <Fragment key={i}>
          <span className="flex min-w-0 items-baseline gap-x-1.5">
            {part}
            {i < parts.length - 1 && (
              <span aria-hidden="true" className="text-ink-subtle">
                ·
              </span>
            )}
          </span>
        </Fragment>
      ))}
    </span>
  )
}

/**
 * THE NOTE ON THE RIGHT: one short phrase at the end of the title's line -- how late, how far
 * along, where a meeting is in its own zone. Never wraps; never more than one.
 */
export function RowNote({
  children,
  tone = 'text-ink-subtle',
}: {
  children: ReactNode
  tone?: string
}) {
  return (
    <span
      data-row-note
      // Not on a phone: there the margin's word and its colour say it, and the title needs the room.
      className={`shrink-0 pt-2.5 pl-3 text-sm leading-6 whitespace-nowrap tabular-nums max-sm:hidden ${tone}`}
    >
      {children}
    </span>
  )
}

/** A momentary "Saved" after a save from the detail panel. It sits inline after the title rather
 * than in a column, so it never reserves width and never moves one. */
export function SavedMark() {
  return (
    <span role="status" className="ml-2 shrink-0 text-sm font-normal text-ink-muted">
      Saved
    </span>
  )
}
