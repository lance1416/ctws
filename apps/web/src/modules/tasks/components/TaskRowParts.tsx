import type { MouseEvent, ReactNode } from 'react'

/** The row parts only the task lists use; the shared anatomy is `shell/rows/RowParts`. */

/** A click on a row opens it unless it landed on one of the row's own buttons. */
export const opensOnClick = (e: MouseEvent) => !(e.target as HTMLElement).closest('button')

/**
 * The tree's four columns (FR-054, artboard 8): name, stage, progress, due, a row 36 high. On a
 * phone only the name and the due day: the stage and the progress are in the detail.
 */
export const TREE_ROW =
  'grid min-h-9 grid-cols-[minmax(0,1fr)_112px_96px_92px] items-center gap-x-3 px-3 max-md:grid-cols-[minmax(0,1fr)_84px]'

/** A column the phone's tree leaves out. */
export const WIDE_ONLY = 'max-md:hidden'

/** One level deeper in the tree; a drag sideways by this much moves a row a level. */
export const INDENT_PX = 22

/** Where a row's mark (its status or its square) starts at `depth`: past its indent and fold. */
export const markStart = (depth: number) => (depth - 1) * INDENT_PX + 16 + 6

/** Where a row's title starts, past its mark: the inline new-task boxes start there too. */
export const titleStart = (depth: number) => markStart(depth) + 16 + 6 + 4

/**
 * The ground under controls over a hovered row's end: an opaque sheet under the hover layer, which
 * alone is translucent and would let the title show through.
 */
export const OVER_ROW = 'bg-panel shadow-[inset_0_0_0_100vmax_var(--color-hover)]'

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

/** A momentary "Saved" after a save from the pane, inline after the title: it reserves no width. */
export function SavedMark() {
  return (
    <span role="status" className="ml-2 shrink-0 text-ui font-normal text-muted">
      Saved
    </span>
  )
}
