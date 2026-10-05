import { projectRailClass } from '../projectColor'
import type { DateHints } from '../dueAt'

/**
 * The row system. Every list in the app -- 今天, the project tree, 已完成 and the search results --
 * lays a row out with the SAME parts at the SAME x: the project rail at zero, the status marker,
 * the title, then the right-hand zone where each kind of date has a column of its own.
 *
 * Why columns and not "whatever follows the text": scanning a list means finding the same piece of
 * information at the same place on every line. Before this, a row's date hint sat wherever its
 * title happened to end, so "已逾 5 天" floated hundreds of pixels from one row to the next and
 * every line had to be re-read instead of scanned.
 */

/** Tree geometry, shared by the tree row and the inline new-task input so they stay aligned. */
export const INDENT_PX = 20
export const HANDLE_PX = 16
export const CHEVRON_PX = 20
/**
 * The project rail's gutter. The rail is at x=0 on EVERY row, BEFORE any depth indentation:
 * it carries project identity only, and depth is carried by the hairline guides (plan section 6,
 * "take off one accessory").
 */
export const RAIL_GUTTER_PX = 12

/**
 * The two date columns and the action slot, written out as whole class strings. They are literals
 * because Tailwind only emits classes it can SEE in the source: an interpolated
 * `grid-cols-[${x}]` compiles to nothing.
 *
 * 7.5rem fits the longest everyday deadline label ("今天 23:30 截止") at 13px; 9rem fits the
 * carried-plan sentence ("原定9月28日，已顺延"), the longest thing either column holds. The
 * sentence is kept whole rather than shortened, because those words -- not the colour -- are what
 * say "carried".
 *
 * Below `sm` the right-hand zone drops onto a second line of its own, as the SAME two columns:
 * a phone has no room for five tracks, and giving up the alignment there would give up the point.
 */
export const ROW_GRID =
  'grid-cols-[1.5rem_minmax(0,1fr)_3.5rem] sm:grid-cols-[1.5rem_minmax(0,1fr)_7.5rem_9rem_3.5rem]'
/** The wrapper that holds the two date columns on a narrow screen and dissolves on a wide one. */
export const ROW_DATE_STACK = 'grid grid-cols-[7.5rem_9rem] sm:contents'
/** 已完成 has one right-hand column (the clock), so it gets its own, shorter template. */
export const DONE_ROW_GRID = 'grid-cols-[1.5rem_minmax(0,1fr)_4.5rem]'
/**
 * How wide a LIST is, which is not how wide the column is. The work column is capped at 51rem so
 * that opening the detail pane reflows nothing (stage 1), but a list of title + two dates has no
 * business spending all of it: at the full width the clock on 已完成 sat 570px from the task it
 * timed, and a deadline sat 300px from its title. A right-hand column that far from its row is
 * not using the width, it is spending it -- the same defect stage 1 found one level up.
 */
export const LIST_MEASURE = 'max-w-[47rem]'
/** 已完成 carries one short column (a clock), so its list is narrower still. */
export const DONE_LIST_MEASURE = 'max-w-[34rem]'

/** The tree is a flex row (depth padding, drag handle), so its cells carry their widths directly. */
export const DUE_CELL = 'w-30 max-sm:w-auto'
export const PLAN_CELL = 'w-36 max-sm:w-auto'

/**
 * The 3px bar at x=0. It means ONE thing -- which project this task belongs to -- in every view.
 * On a cross-project list (今天, 已完成, search) that makes "which project is this" pre-attentive;
 * in a project tree it is one continuous spine.
 *
 * `aria-hidden`, and never the only carrier: there are six hues and more projects than that, so
 * two projects can share one. The project's NAME is always on the row as well (WCAG 1.4.1). The
 * rail is a hint for the eye, not an identifier.
 */
export function ProjectRail({
  projectId,
  continuous = false,
  at = 'left-0',
}: {
  projectId: string
  /**
   * True inside a project tree, where every row is the same project: the rail runs the full
   * height of each row and square, so the rows join into ONE spine rather than a column of
   * dashes. On a cross-project list each row is a separate project, so each rail is its own
   * rounded segment.
   */
  continuous?: boolean
  /** Where x=0 is for this list. The search overlay insets it, so the rail is not mistaken for
   *  a piece of the dialog's own rounded edge. */
  at?: string
}) {
  return (
    <span
      aria-hidden="true"
      data-project-rail={projectId}
      className={`pointer-events-none absolute w-[3px] ${at} ${
        continuous ? 'inset-y-0' : 'top-1 bottom-1 rounded-full'
      } ${projectRailClass(projectId)}`}
    />
  )
}

/**
 * A deadline's glyph: a flag on a pole. Upright, with a vertical silhouette.
 *
 * The two date semantics must not differ by HUE ALONE (plan section 2). They differ in three
 * channels: the words ("…截止" against "排到…"), the colour family (warm against cool) and -- this
 * -- the shape. A flag is a line you must not cross; it is filled once the line has been crossed.
 */
function DeadlineMark({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      width="12"
      height="12"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <path d="M3.25 1.5V11" />
      <path d="M3.25 2.6L9.75 4.4 3.25 6.2z" fill={filled ? 'currentColor' : 'none'} />
    </svg>
  )
}

/**
 * A plan's glyph: a tick on a timeline. Deliberately HORIZONTAL, so in a grey screenshot (or to a
 * colourblind reader) a plan and a deadline are told apart by silhouette alone.
 */
function PlanMark() {
  return (
    <svg
      viewBox="0 0 12 12"
      width="12"
      height="12"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <path d="M1 8.75h10" />
      <path d="M6 4.25v4.5" />
    </svg>
  )
}

/**
 * The deadline column. Empty but still reserved when the task has no deadline: the column only
 * works if it is in the same place on a row that has nothing to put in it.
 *
 * The label text is a DIRECT child, with no wrapper span: a nested copy would make
 * `getByText('已逾 5 天')` match two elements, and the exact instant lives in `title`.
 */
export function DueCell({
  due,
  exact,
  className = '',
}: {
  due: DateHints['due']
  /** The exact local deadline, for the tooltip: "2026-10-01 09:00". */
  exact?: string | undefined
  className?: string
}) {
  if (!due) return <span aria-hidden="true" className={className} />
  return (
    <span
      data-date-hint={due.overdue ? 'overdue' : 'due'}
      title={exact}
      className={`flex items-center gap-1 overflow-hidden text-sm whitespace-nowrap tabular-nums ${
        due.overdue ? 'font-medium text-missed' : 'text-deadline'
      } ${className}`}
    >
      <DeadlineMark filled={due.overdue} />
      {due.text}
    </span>
  )
}

/** The plan column. `carried` is a plan whose day has already gone -- not a missed deadline. */
export function PlanCell({
  text,
  carried = false,
  exact,
  className = '',
}: {
  text: string | null
  carried?: boolean
  /** The full sentence when the column shows a shortened form of it. */
  exact?: string | undefined
  className?: string
}) {
  if (!text) return <span aria-hidden="true" className={className} />
  return (
    <span
      data-date-hint={carried ? 'carried' : 'scheduled'}
      title={exact}
      className={`flex items-center gap-1 text-sm text-plan ${carried ? 'font-medium' : ''} ${className}`}
    >
      <PlanMark />
      <span className="truncate">{text}</span>
    </span>
  )
}

/** A momentary "已保存" after a save from the detail panel. It sits inline after the title rather
 * than in a column, so it never reserves width and never moves one. */
export function SavedMark() {
  return (
    <span role="status" className="ml-2 shrink-0 text-sm font-normal text-fg-muted">
      已保存
    </span>
  )
}
