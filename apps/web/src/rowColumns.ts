/**
 * WHICH DATE COLUMNS A LIST NEEDS, and how wide that makes the list.
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
 * `display: contents` rows. The tree's rows are flex rows whose date cells carry CONSTANT widths
 * (`w-32` / `w-44`), and the flat lists are per-row grids built from the same constant template:
 * in both cases every row already derives its track widths from the same literals, so making the
 * COUNT of tracks a per-list decision is enough to keep the x identical. A JS measurement written
 * into a CSS variable would buy nothing and would add a layout pass per render; a single grid with
 * `display: contents` rows would also put @dnd-kit's per-row drag transform on an element that is
 * not a box, which is the conflict the spec warned about. Neither is needed.
 *
 * The class strings are written out whole because Tailwind only emits classes it can SEE: an
 * interpolated `grid-cols-[${x}]` compiles to nothing.
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

/**
 * The flat row's grid. The NARROW template is always three tracks -- marker, title, actions --
 * because below the container's `@xl` the two date cells drop onto a second line of their own
 * (that is `ROW_DATE_STACK`); only the wide template gains or loses the date tracks.
 */
const NARROW = 'grid-cols-[1.75rem_minmax(0,1fr)_4.5rem]'

export function rowGridClass(c: DateColumns): string {
  if (c.due && c.plan) return `${NARROW} @xl:grid-cols-[1.75rem_minmax(0,1fr)_8rem_11rem_4.5rem]`
  if (c.due) return `${NARROW} @xl:grid-cols-[1.75rem_minmax(0,1fr)_8rem_4.5rem]`
  if (c.plan) return `${NARROW} @xl:grid-cols-[1.75rem_minmax(0,1fr)_11rem_4.5rem]`
  // Identical to the narrow template, so there is nothing for `@xl` to override.
  return NARROW
}

/** The deadline cell is always the FIRST date column, so its line is fixed when it exists. */
export const DUE_COLUMN_CLASS = '@xl:col-start-3 @xl:row-start-1 @xl:h-7'

/** The plan cell follows the deadline column when there is one, and takes its place when not. */
export const planColumnClass = (c: DateColumns): string =>
  c.due ? '@xl:col-start-4 @xl:row-start-1 @xl:h-7' : '@xl:col-start-3 @xl:row-start-1 @xl:h-7'

/** The action slot is the LAST track, so its line moves with the number of date columns. */
export function actionColumnClass(c: DateColumns): string {
  if (c.due && c.plan) return '@xl:col-start-5'
  if (c.due || c.plan) return '@xl:col-start-4'
  return ''
}

/**
 * HOW WIDE THE LIST IS, DERIVED (spec §3). `47rem` was sized for "title + two date columns"; once
 * the columns can collapse it stops being a measure and becomes a magic number. A list whose rows
 * are TITLE ONLY has nothing on the right to be flung away from, so it widens to 64rem and the
 * title finally gets the horizontal space the panel has. A list that does carry a date column
 * keeps 47rem, because that is the distance past which a right-hand cell stops belonging to its
 * row.
 *
 * 已完成 (36rem) and the project list (30rem) are untouched: their column makeup is fixed, so
 * their measures were never derived from anything that can now change.
 */
export const listMeasureClass = (c: DateColumns): string =>
  hasDateColumn(c) ? 'max-w-[47rem]' : 'max-w-[64rem]'
