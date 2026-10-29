import type { MouseEvent, ReactNode } from 'react'
import { KIND_ICON, LockIcon } from '../../../platform/ui/icons'

/** The row parts only the task lists use; the shared anatomy is `shell/rows/RowParts`. */

/** A click on a row opens it unless it landed on one of the row's own buttons. */
export const opensOnClick = (e: MouseEvent) => !(e.target as HTMLElement).closest('button')

/**
 * The tree's four columns (FR-054, artboard 8): name, stage, progress, due, a row 36 high; then
 * a place of its own for the row's hover controls, so they never cover the due day (I-06): 64
 * for two buttons, wider where a list sets `--row-acts` (the inbox's Move to…). On a phone only
 * the name and the due day: the stage and the progress are in the detail.
 */
export const TREE_ROW =
  'grid min-h-9 grid-cols-[minmax(0,1fr)_112px_96px_92px_var(--row-acts,64px)] items-center gap-x-3 px-3 max-md:grid-cols-[minmax(0,1fr)_84px]'

/** A column the phone's tree leaves out. */
export const WIDE_ONLY = 'max-md:hidden'

/** One level deeper in the tree; a drag sideways by this much moves a row a level. */
export const INDENT_PX = 22

/** Where a row's mark (its status or its square) starts at `depth`: past its indent and fold. */
export const markStart = (depth: number) => (depth - 1) * INDENT_PX + 16 + 6

/** Where a row's title starts, past its mark: the inline new-task boxes start there too. */
export const titleStart = (depth: number) => markStart(depth) + 16 + 6 + 4

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

/**
 * A lock on the status mark's corner, for a leaf something unfinished holds up (FR-041,
 * artboard 8). Inside the 28px status button that sits at -6px, so it lands on the glyph's own
 * corner; on a bare 16px mark (a board card) it hangs 4px past it. The words are the row's, said
 * elsewhere.
 */
export function WaitingBadge({ bare = false }: { bare?: boolean }) {
  return (
    <span
      aria-hidden="true"
      data-waiting-badge
      className={`pointer-events-none absolute grid size-[11px] place-items-center rounded-full bg-panel text-warn ${
        bare ? '-right-1 -bottom-1' : 'right-0.5 bottom-0.5'
      }`}
    >
      <LockIcon size={9} />
    </span>
  )
}

/**
 * The organisation a node is linked to (FR-047, artboard 8): the kind's building on its tint, so
 * a company's row is told from a role's at a glance. Its names, on hover and said.
 */
export function OrganisationMark({ names }: { names: readonly string[] }) {
  const Building = KIND_ICON.organisation
  const said = names.join(', ')
  return (
    <span
      data-row-organisation
      title={said}
      className="inline-grid size-5 shrink-0 place-items-center rounded-control bg-organisation-bg text-organisation"
    >
      <Building size={12} aria-hidden="true" />
      <span className="sr-only">, {said}</span>
    </span>
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
