/**
 * THE ROW'S LEADING ICON, and how wide a list is.
 *
 * This replaces the right-hand date columns outright (rows-and-reading §3, second edition). The row
 * is now `[status marker 1.75rem][icon slot 1.5rem][title -- the whole line]`, with the full date
 * wording on a second line under the title. Three mechanisms went with the columns, and none of
 * them has a survivor here:
 *
 *   1. the `8rem` deadline column and the `11rem` plan column;
 *   2. the stack threshold (`2 x furniture`) and the container queries that drove it -- the cramped
 *      panel and the wide one are now THE SAME LAYOUT, so there is nothing left to switch between;
 *   3. the list measure derived from the column makeup (64 / 72.75 / 75.75 / 84.5rem) -- the title
 *      no longer competes with anything on its right, so one measure answers for every list.
 *
 * WHAT SURVIVES is the rule that earned its keep: a slot is reserved FOR THE WHOLE LIST or not at
 * all. A slot that exists on some rows and not others puts the first glyph of every row at a
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
 * A deadline beats a plan because it is the one that bites (spec §2), and either beats the notes
 * mark: the slot answers 「有没有、急不急」 and a note is neither. The row does not LOSE the note
 * when a date wins the slot -- the `≡` then stays beside the title, exactly where it sat before
 * this stage (`TaskRow`) -- and the second line lists both dates in full either way.
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
 * It was four values derived from the column makeup, because a list that reserved 19rem for dates
 * had to be wider to leave the title the same track. There are no date columns, so there is nothing
 * to derive from: 64rem is the measure the title-only list already shipped with, which makes the
 * case that was never broken byte-identical, and it is now the only case there is.
 */
export const LIST_MEASURE = 'max-w-[64rem]'
