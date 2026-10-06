import { describe, expect, it } from 'vitest'
import { hasLeadSlot, leadIcon, LEAD_GAP_PX, LEAD_SLOT_PX, LIST_MEASURE } from './rowLead'

/** Every combination of what a row can carry, so a priority rule cannot be checked in half its cases. */
const ROWS = [false, true].flatMap((due) =>
  [false, true].flatMap((plan) =>
    [false, true].flatMap((notes) =>
      [false, true].map((overdue) => ({ due, plan, notes, overdue })),
    ),
  ),
)

describe('leadIcon', () => {
  it('shows nothing for a row that carries nothing', () => {
    expect(leadIcon({ due: false, plan: false, notes: false })).toBeNull()
    expect(leadIcon({ due: false, plan: false, notes: false, overdue: true })).toBeNull()
  })

  it('shows the deadline on a row that has one, and says whether it has passed', () => {
    expect(leadIcon({ due: true, plan: false, notes: false })).toBe('deadline')
    expect(leadIcon({ due: true, plan: false, notes: false, overdue: true })).toBe('missed')
  })

  it('shows the DEADLINE on a row that has a plan as well -- the one that bites (§2)', () => {
    expect(leadIcon({ due: true, plan: true, notes: false })).toBe('deadline')
    expect(leadIcon({ due: true, plan: true, notes: true, overdue: true })).toBe('missed')
  })

  it('falls back to the plan, then to the notes mark', () => {
    expect(leadIcon({ due: false, plan: true, notes: true })).toBe('plan')
    expect(leadIcon({ due: false, plan: false, notes: true })).toBe('notes')
    // A plan has no "overdue": a carried plan is not a missed deadline, and the glyph must not
    // start claiming it is.
    expect(leadIcon({ due: false, plan: true, notes: false, overdue: true })).toBe('plan')
  })

  /**
   * THE CLOCK MAY ONLY CHOOSE THE GLYPH, NEVER WHETHER THERE IS ONE. The slot is reserved for the
   * whole list from a clock-free predicate (`hasLeadSlot`, fed by `dateMarks`), so if midnight could
   * make an icon appear or disappear the list's structure and its rows would disagree: a reserved
   * 1.5rem with nothing in it, or a glyph with no slot under it.
   */
  it('depends on the clock for WHICH icon, never for whether there is one', () => {
    for (const row of ROWS) {
      const withClock = leadIcon(row)
      const without = leadIcon({ due: row.due, plan: row.plan, notes: row.notes })
      expect(withClock === null, JSON.stringify(row)).toBe(without === null)
    }
  })
})

describe('hasLeadSlot', () => {
  it('reserves nothing for an empty list, or one where no row carries anything', () => {
    expect(hasLeadSlot([])).toBe(false)
    expect(
      hasLeadSlot([
        { due: false, plan: false, notes: false },
        { due: false, plan: false, notes: false },
      ]),
    ).toBe(false)
  })

  /**
   * The rule that survived the columns: the slot is reserved for the WHOLE list, so one row with a
   * deadline gives every row of the list its slot and the glyphs land at ONE x. Per row -- or per
   * group -- would put the first glyph of each row somewhere else, and the leading icons are the
   * only column this layout has.
   */
  it('reserves the slot for the whole list when a SINGLE row carries anything', () => {
    for (const mark of ['due', 'plan', 'notes'] as const) {
      const rows = [
        { due: false, plan: false, notes: false },
        { due: false, plan: false, notes: false, [mark]: true },
        { due: false, plan: false, notes: false },
      ]
      expect(hasLeadSlot(rows), mark).toBe(true)
    }
  })

  it('agrees with leadIcon, row for row', () => {
    for (const row of ROWS)
      expect(hasLeadSlot([row]), JSON.stringify(row)).toBe(leadIcon(row) !== null)
  })
})

describe('the geometry', () => {
  it('reserves the 1.5rem the spec names, plus the gap the input has to clear', () => {
    expect(LEAD_SLOT_PX).toBe(24) // 1.5rem
    expect(LEAD_GAP_PX).toBe(4)
  })

  /**
   * ONE MEASURE, for every list. The four derived measures (64 / 72.75 / 75.75 / 84.5rem) existed
   * because a list that reserved 19rem of date columns had to be wider to leave the title the same
   * track; there are no date columns, so there is nothing to derive from -- and 64rem is what the
   * title-only list already shipped with, so the case that was never broken is unchanged.
   */
  it('is a single literal, and the one the title-only list already had', () => {
    expect(LIST_MEASURE).toBe('max-w-[64rem]')
    // Not a function of anything: a module that exports a measure PER CASE is the mechanism §3
    // deleted, and this is the test that notices it coming back.
    expect(typeof LIST_MEASURE).toBe('string')
  })
})
