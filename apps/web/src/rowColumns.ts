/**
 * WHICH DATE COLUMNS A LIST NEEDS, how wide that makes the list, and when the columns stop fitting
 * beside the title at all.
 *
 * The row system reserves a fixed track for the deadline and another for the plan, so the cell
 * lands at an identical x on every row and the list can be scanned instead of read. The cost used
 * to be paid unconditionally: `1.75rem · 1fr · 8rem · 11rem · 4.5rem` spent **23.5rem on the
 * right-hand zone whether or not any row in the list had a date**, and `47rem` of list measure on
 * top of that left the title track at about 348px however wide the panel grew. That is the defect
 * 「字直接被截断了」 names.
 *
 * THE COLLAPSE IS PER WHOLE LIST, NEVER PER GROUP (rows-and-reading spec §2). A column exists iff
 * SOME row in that list has that value. Collapsing per group would put the same column at a
 * different x in each group, which destroys the only thing a fixed column is for.
 *
 * NOTHING HERE IS MEASURED AT RUNTIME, and no list needs to become one grid with
 * `display: contents` rows. The tree's rows are flex rows whose date cells carry CONSTANT widths,
 * and the flat lists are per-row grids built from the same constant template: in both cases every
 * row already derives its track widths from the same literals, so making the COUNT of tracks a
 * per-list decision is enough to keep the x identical. A JS measurement written into a CSS variable
 * would buy nothing and would add a layout pass per render; a single grid with `display: contents`
 * rows would also put @dnd-kit's per-row drag transform on an element that is not a box, which is
 * the conflict the spec warned about. Neither is needed.
 *
 * The class strings are written out whole because Tailwind only emits classes it can SEE: an
 * interpolated `grid-cols-[${x}]` or `@min-[${t}]:contents` compiles to nothing. Every literal
 * below is checked against the arithmetic in `rowColumns.test.ts`, so the numbers cannot drift
 * away from the derivation that produced them.
 */

/** Which of the two right-hand date columns a list reserves. */
export type DateColumns = { due: boolean; plan: boolean }

/** True when either column is reserved, i.e. the row has a right-hand zone at all. */
export const hasDateColumn = (c: DateColumns): boolean => c.due || c.plan

/**
 * The columns a list needs, from one entry per row saying whether that row would fill each cell.
 * An empty list reserves nothing: there is no row whose cell would be at a shared x.
 */
export function dateColumns(rows: Iterable<{ due: boolean; plan: boolean }>): DateColumns {
  const out: DateColumns = { due: false, plan: false }
  for (const row of rows) {
    if (row.due) out.due = true
    if (row.plan) out.plan = true
    if (out.due && out.plan) break
  }
  return out
}

// --------------------------------------------------------------------------- the two derivations

/** The status marker's track. */
export const MARKER_REM = 1.75
/** Fits the longest everyday deadline label ("今天 23:30 截止") at 14px. */
export const DUE_REM = 8
/** Fits the carried-plan sentence ("原定9月28日，已顺延"), the longest thing either column holds. */
export const PLAN_REM = 11
/**
 * The gutter that separates a date column from what precedes it, and therefore PART OF WHAT THE
 * COLUMN COSTS. Counting the cell alone made the title track 24px narrower on a list with both
 * columns than on a title-only one -- which is the very step-down this ruling abolishes, just a
 * small one.
 */
export const COLUMN_GAP_REM = 0.75
/** The action slot at the end of the row. */
export const ACTION_REM = 4.5

/**
 * THE TITLE TRACK IS A CONSTANT (spec §3). A title truncates at the same width whether or not its
 * list carries date columns; the list widens to carry the columns that exist instead of clamping
 * the title back down. The previous shape of this rule was a STEP DOWN -- 64rem for a title-only
 * list, 47rem the moment one row had a deadline -- which put the title track back to 276px in a
 * 1134px panel with ~540px of it empty, i.e. it left the original complaint standing for every
 * project that has one date anywhere in it.
 *
 * 57.75rem is not a new number: it is the baseline the shipped title-only measure already implied.
 * That list was 64rem and spent `MARKER_REM` and `ACTION_REM` on furniture, so 64 − 1.75 − 4.5 =
 * 57.75 is what the title had. Reusing it means the title-only case is BYTE-IDENTICAL to what was
 * shipped (no regression, which is the one constraint on the choice), and every other case is that
 * same track plus exactly the columns it carries.
 */
export const TITLE_BASELINE_REM = 57.75

/** Everything on the row that is not the title, for a given column set. */
export const furnitureRem = (c: DateColumns): number =>
  MARKER_REM +
  (c.due ? DUE_REM + COLUMN_GAP_REM : 0) +
  (c.plan ? PLAN_REM + COLUMN_GAP_REM : 0) +
  ACTION_REM

/** measure = marker + title baseline + the columns that exist + action slot. A sum, not a step. */
export const listMeasureRem = (c: DateColumns): number => TITLE_BASELINE_REM + furnitureRem(c)

/**
 * WHERE THE DATES DROP BELOW THE TITLE (spec §3). The decision belongs to the CONTAINER, not the
 * viewport: at 1440 with the detail column open the list is only ~734px wide, which cannot hold a
 * title plus 8rem plus 11rem plus an action slot -- and no list measure can fix that, because the
 * panel, not the measure, is what is narrow. A viewport rule gets this exactly wrong, which is why
 * the tree used to truncate at 1440 while a phone wrapped correctly.
 *
 * The old threshold (`@xl`, 36rem) was a named breakpoint rather than a derived one, and it was
 * too low: a 734px list cleared it and then clipped its titles. The threshold here is derived from
 * the column widths: the dates stay beside the title only while THE TITLE TRACK IS AT LEAST AS
 * WIDE AS EVERYTHING ELSE ON THE ROW PUT TOGETHER. Below that the right-hand zone is taking more
 * than half of a row whose subject is the title, so the dates go to a line of their own and the
 * title takes the full width.
 *
 * That is 2 × furniture: 53.5rem (808px) with both columns, 36rem with only the plan column,
 * 30rem with only the deadline. 808px falls between the two panels that matter -- the 734px one
 * stacks and gives its title the whole row, the 1134px one keeps its columns -- which is the
 * behaviour the defect asked for, derived rather than dialled in.
 */
export const rowStackBelowRem = (c: DateColumns): number => 2 * furnitureRem(c)

// ------------------------------------------------------------------- the literals, per column set

/** Which of the four column sets a list is in. Only these four exist, so the literals are total. */
export type ColumnCase = 'none' | 'due' | 'plan' | 'both'

export const columnCase = (c: DateColumns): ColumnCase =>
  c.due && c.plan ? 'both' : c.due ? 'due' : c.plan ? 'plan' : 'none'

/**
 * The flat row's grid. The STACKED template is always three tracks -- marker, title, actions --
 * because below the threshold the date cells drop onto a second line of their own (that is
 * `rowDateStackClass`); only the wide template gains or loses the date tracks.
 */
const NARROW = 'grid-cols-[1.75rem_minmax(0,1fr)_4.5rem]'

const ROW_GRID: Record<ColumnCase, string> = {
  both: `${NARROW} @min-[53.5rem]:grid-cols-[1.75rem_minmax(0,1fr)_8rem_11rem_4.5rem]`,
  due: `${NARROW} @min-[30rem]:grid-cols-[1.75rem_minmax(0,1fr)_8rem_4.5rem]`,
  plan: `${NARROW} @min-[36rem]:grid-cols-[1.75rem_minmax(0,1fr)_11rem_4.5rem]`,
  // Identical to the stacked template, so there is nothing for the threshold to override.
  none: NARROW,
}

export const rowGridClass = (c: DateColumns): string => ROW_GRID[columnCase(c)]

/** The deadline cell is always the FIRST date column, so its line is fixed when it exists. */
const DUE_LINE: Record<ColumnCase, string> = {
  both: '@min-[53.5rem]:col-start-3 @min-[53.5rem]:row-start-1 @min-[53.5rem]:h-7',
  due: '@min-[30rem]:col-start-3 @min-[30rem]:row-start-1 @min-[30rem]:h-7',
  plan: '',
  none: '',
}

export const dueColumnClass = (c: DateColumns): string => DUE_LINE[columnCase(c)]

/** The plan cell follows the deadline column when there is one, and takes its place when not. */
const PLAN_LINE: Record<ColumnCase, string> = {
  both: '@min-[53.5rem]:col-start-4 @min-[53.5rem]:row-start-1 @min-[53.5rem]:h-7',
  due: '',
  plan: '@min-[36rem]:col-start-3 @min-[36rem]:row-start-1 @min-[36rem]:h-7',
  none: '',
}

export const planColumnClass = (c: DateColumns): string => PLAN_LINE[columnCase(c)]

/** The action slot is the LAST track, so its line moves with the number of date columns. */
const ACTION_LINE: Record<ColumnCase, string> = {
  both: '@min-[53.5rem]:col-start-5',
  due: '@min-[30rem]:col-start-4',
  plan: '@min-[36rem]:col-start-4',
  none: '',
}

export const actionColumnClass = (c: DateColumns): string => ACTION_LINE[columnCase(c)]

/**
 * The wrapper that holds a flat row's two date cells on a narrow list and dissolves on a wide one.
 * Two EQUAL columns rather than the wide row's fixed rem widths: a list that cannot spend 19rem on
 * dates can still put them at the same x on every row of the list, which is the whole point, and
 * proportions do that as well as fixed widths. The split is 2:3 and not 1:1 because the plan cell
 * holds a whole sentence ("原定9月28日，已顺延") while the deadline cell holds four characters, and
 * those words -- not the colour -- are what say "carried".
 */
const DATE_STACK: Record<ColumnCase, string> = {
  both: 'grid grid-cols-[2fr_3fr] @min-[53.5rem]:contents',
  due: 'grid grid-cols-[2fr_3fr] @min-[30rem]:contents',
  plan: 'grid grid-cols-[2fr_3fr] @min-[36rem]:contents',
  none: '',
}

export const rowDateStackClass = (c: DateColumns): string => DATE_STACK[columnCase(c)]

// ------------------------------------------------------------------------------- the tree's row

/**
 * The tree's row is a flex row (depth padding, a drag handle), not a grid, so its stacking is
 * `flex-wrap` plus `w-full` rather than `contents` plus a second grid line. Same threshold, same
 * container: these used to be `sm:` / `max-sm:`, keyed to the VIEWPORT, which is precisely why a
 * 734px list inside a 1440px window truncated its titles while a 375px phone wrapped them.
 */
const TREE_WRAP: Record<ColumnCase, string> = {
  both: '@max-[53.5rem]:flex-wrap',
  due: '@max-[30rem]:flex-wrap',
  plan: '@max-[36rem]:flex-wrap',
  none: '',
}

export const treeRowWrapClass = (c: DateColumns): string => TREE_WRAP[columnCase(c)]

/** The date pair on a tree row that HAS at least one of the values: its own line when stacked. */
const TREE_LINE: Record<ColumnCase, string> = {
  both: 'flex items-center @min-[53.5rem]:contents @max-[53.5rem]:order-last @max-[53.5rem]:w-full @max-[53.5rem]:gap-3 @max-[53.5rem]:pb-1 @max-[53.5rem]:pl-[4.25rem]',
  due: 'flex items-center @min-[30rem]:contents @max-[30rem]:order-last @max-[30rem]:w-full @max-[30rem]:gap-3 @max-[30rem]:pb-1 @max-[30rem]:pl-[4.25rem]',
  plan: 'flex items-center @min-[36rem]:contents @max-[36rem]:order-last @max-[36rem]:w-full @max-[36rem]:gap-3 @max-[36rem]:pb-1 @max-[36rem]:pl-[4.25rem]',
  none: '',
}

/**
 * ...and on a row that has NEITHER value it is `hidden` while stacked rather than absent, so a
 * dateless row costs no second line while the reserved widths above the threshold (where
 * `contents` dissolves this span) are untouched.
 */
const TREE_LINE_EMPTY: Record<ColumnCase, string> = {
  both: 'flex items-center @min-[53.5rem]:contents @max-[53.5rem]:hidden',
  due: 'flex items-center @min-[30rem]:contents @max-[30rem]:hidden',
  plan: 'flex items-center @min-[36rem]:contents @max-[36rem]:hidden',
  none: '',
}

export const treeDateLineClass = (c: DateColumns, filled: boolean): string =>
  (filled ? TREE_LINE : TREE_LINE_EMPTY)[columnCase(c)]

/**
 * A tree date cell: the fixed width above the threshold, its content's width below it (where the
 * row has given the pair a line of its own and the two cells share it).
 */
const TREE_DUE_CELL: Record<ColumnCase, string> = {
  both: 'ml-3 shrink-0 w-32 @max-[53.5rem]:ml-0 @max-[53.5rem]:w-auto',
  due: 'ml-3 shrink-0 w-32 @max-[30rem]:ml-0 @max-[30rem]:w-auto',
  plan: '',
  none: '',
}

const TREE_PLAN_CELL: Record<ColumnCase, string> = {
  both: 'ml-3 shrink-0 w-44 @max-[53.5rem]:ml-0 @max-[53.5rem]:w-auto',
  due: '',
  plan: 'ml-3 shrink-0 w-44 @max-[36rem]:ml-0 @max-[36rem]:w-auto',
  none: '',
}

export const treeDueCellClass = (c: DateColumns): string => TREE_DUE_CELL[columnCase(c)]
export const treePlanCellClass = (c: DateColumns): string => TREE_PLAN_CELL[columnCase(c)]

// ----------------------------------------------------------------------------- the list measure

/**
 * HOW WIDE THE LIST IS, DERIVED (spec §3): `listMeasureRem`, written out as a literal Tailwind can
 * see. 64rem for a title-only list is the number that was shipped; the others are that same title
 * track plus the columns they carry, so a list that gains a deadline gains 8rem of width instead
 * of taking 17rem off its titles.
 *
 * 已完成 (36rem) and the project list (30rem) are untouched: their column makeup is fixed, so
 * their measures were never derived from anything that can now change.
 */
const MEASURE: Record<ColumnCase, string> = {
  both: 'max-w-[84.5rem]',
  due: 'max-w-[72.75rem]',
  plan: 'max-w-[75.75rem]',
  none: 'max-w-[64rem]',
}

export const listMeasureClass = (c: DateColumns): string => MEASURE[columnCase(c)]
