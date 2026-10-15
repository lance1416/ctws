import { Fragment, type MouseEvent, type ReactNode } from 'react'

/** The row parts only the task lists use; the shared anatomy is `shell/rows/RowParts`. */

/** A click on a row opens it unless it landed on one of the row's own buttons. */
export const opensOnClick = (e: MouseEvent) => !(e.target as HTMLElement).closest('button')

/** Tree geometry, shared by the tree row and the inline new-task input so they stay aligned. */
export const INDENT_PX = 20
export const HANDLE_PX = 16
export const CHEVRON_PX = 20

/**
 * The ground under controls over a hovered row's end: an opaque sheet under the hover layer, which
 * alone is translucent and would let the title show through.
 */
export const OVER_ROW = 'bg-sheet shadow-[inset_0_0_0_100vmax_var(--color-hover)]'
export const gutterPlus = (px: number) => `calc(var(--gutter) + ${px}px)`

/** The Done view's rows carry nothing on the right, so its list is kept narrow. */
export const DONE_LIST_MEASURE = 'max-w-[36rem]'

/** The date marks share one canvas, stroke and size, so only their silhouettes differ. */
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
 * A deadline's glyph: an upright flag, filled once the line has been crossed. A deadline and a plan
 * differ by word, by colour family and by this silhouette, never by hue alone.
 */
export function DeadlineMark({ filled }: { filled: boolean }) {
  return (
    <Glyph>
      <path d="M3.25 1.5V11" />
      <path d="M3.25 2.6L9.75 4.4 3.25 6.2z" fill={filled ? 'currentColor' : 'none'} />
    </Glyph>
  )
}

/** A plan's glyph: a tick on a timeline, horizontal so it differs from the flag by silhouette. */
export function PlanMark() {
  return (
    <Glyph>
      <path d="M1 8.75h10" />
      <path d="M6 4.25v4.5" />
    </Glyph>
  )
}

/** A notes glyph: three ruled lines, the shortest last, unlike either date glyph. */
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
 * A row's second line, rendered only when it has something to say. Each phrase is kept whole, so
 * a narrow panel breaks the line between phrases.
 */
export function RowMeta({
  breadcrumb = null,
  age = null,
  rollup = null,
  blocked = null,
}: {
  /** The project (and parent) a cross-project list shows; the tree passes none. */
  breadcrumb?: string | null
  /** "Captured 3 days ago": only the inbox passes one, dropped when the line has more to say. */
  age?: string | null
  /** "60% · 2 in progress · 1 overdue" for a row with children. */
  rollup?: string | null
  /** "Blocked by …": first on the line and never dropped. */
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
    // Only on a line that would otherwise be empty.
    age && !breadcrumb && !rollup && !blocked ? (
      <span key="age" data-row-age className="whitespace-nowrap text-ink-subtle">
        {age}
      </span>
    ) : null,
  ].filter((part) => part !== null)
  if (parts.length === 0) return null
  return (
    <span
      data-row-meta
      className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-sm text-ink-muted"
    >
      {parts.map((part, i) => (
        // The separator travels with the phrase it follows, so no wrapped line starts with a ·.
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

/** One short phrase at the end of the title's line, such as how late. Never wraps. */
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
      // Not on a phone: the margin's word and colour say it there, and the title needs the room.
      className={`shrink-0 pt-2.5 pl-3 text-sm leading-6 whitespace-nowrap tabular-nums max-sm:hidden ${tone}`}
    >
      {children}
    </span>
  )
}

/** A momentary "Saved" after a save from the pane, inline after the title: it reserves no width. */
export function SavedMark() {
  return (
    <span role="status" className="ml-2 shrink-0 text-sm font-normal text-ink-muted">
      Saved
    </span>
  )
}
