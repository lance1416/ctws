/**
 * THE ROW'S LEADING ICON, and how wide a list is.
 *
 * NO RIGHT-HAND DATE COLUMNS. A row is `[status marker 1.75rem][icon slot 1.5rem][title -- the
 * whole line]`, with the full date wording on a second line under the title. So there is no
 * deadline or plan column, no stack threshold and no container query -- the cramped panel and the
 * wide one are THE SAME LAYOUT -- and no list measure derived from a column makeup, because the
 * title competes with nothing on its right.
 *
 * THE ONE RULE THAT REMAINS: a slot is reserved FOR THE WHOLE LIST or not at all. A slot that exists on some rows and not others puts the first glyph of every row at a
 * different x, and the leading icons are the only column this layout still has.
 *
 * NOTHING HERE READS THE CLOCK. Whether the slot exists is decided by whether a row HAS a deadline,
 * a plan or notes; only WHICH glyph goes in it depends on whether the deadline has passed. A
 * midnight tick can therefore change a flag from `deadline` to `missed` but can never add or remove
 * the slot under it, so the list's structure and its rows cannot disagree.
 */

/** The four things the leading slot can say. `missed` is a deadline whose day has gone. */
export type LeadIcon = 'missed' | 'deadline' | 'plan' | 'notes'

/** What a row has, with no wording and no clock in it. */
export type RowMarks = { due: boolean; plan: boolean; notes: boolean }

/**
 * The ONE icon a row shows at its start.
 *
 * A deadline beats a plan because it is the one that bites, and either beats the notes mark: the
 * slot answers whether there is a date and whether it bites, and a note is neither. The row does
 * not LOSE the note when a date wins the slot -- the `≡` stays beside the title (`TaskRow`) -- and
 * the second line lists both dates in full either way.
 */
export function leadIcon(r: RowMarks & { overdue?: boolean }): LeadIcon | null {
  if (r.due) return r.overdue ? 'missed' : 'deadline'
  if (r.plan) return 'plan'
  if (r.notes) return 'notes'
  return null
}

/**
 * Whether THIS LIST reserves the slot at all: true iff some row in it would show an icon. An empty
 * list reserves nothing, and a list where nothing is dated and nothing has notes pays no 1.5rem.
 */
export function hasLeadSlot(rows: Iterable<RowMarks>): boolean {
  for (const r of rows) if (leadIcon(r) !== null) return true
  return false
}

/** The slot's width, as a number, so the inline new-task input can line up with the titles. */
export const LEAD_SLOT_PX = 24
/** ...and the gap between the slot and the title, which the input has to clear as well. */
export const LEAD_GAP_PX = 4

/**
 * HOW WIDE A LIST IS -- one value, for every list of tasks.
 *
 * One value and not four derived from a column makeup: a list reserving 19rem for dates has to be
 * wider to leave the title the same track, and there are no date columns. 64rem is the measure of
 * a title-only list, which is the only kind there is.
 */
export const LIST_MEASURE = 'max-w-[64rem]'
