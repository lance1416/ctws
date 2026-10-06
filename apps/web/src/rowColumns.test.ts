import { describe, expect, it } from 'vitest'
import {
  actionColumnClass,
  columnCase,
  dateColumns,
  dueColumnClass,
  furnitureRem,
  hasDateColumn,
  listMeasureClass,
  listMeasureRem,
  planColumnClass,
  rowDateStackClass,
  rowGridClass,
  rowStackBelowRem,
  TITLE_BASELINE_REM,
  treeDateLineClass,
  treeDueCellClass,
  treePlanCellClass,
  treeRowWrapClass,
} from './rowColumns'

/** Every column set there is, so a Record-keyed literal cannot be checked in only three of four. */
const ALL = [
  { due: false, plan: false },
  { due: true, plan: false },
  { due: false, plan: true },
  { due: true, plan: true },
] as const

/** The rem value inside the first `max-w-[...rem]` / `@min-[...rem]` / `@max-[...rem]` of a class. */
const remIn = (cls: string, prefix: string): number | null => {
  const m = new RegExp(`${prefix}\\[([0-9.]+)rem\\]`).exec(cls)
  return m ? Number(m[1]) : null
}

describe('dateColumns', () => {
  it('reserves nothing for a list where no row has a date', () => {
    expect(
      dateColumns([
        { due: false, plan: false },
        { due: false, plan: false },
      ]),
    ).toEqual({ due: false, plan: false })
  })

  it('reserves a column for the WHOLE list when a single row has that value', () => {
    // The point of the per-list rule: one dated row makes the column exist for every row, so the
    // cell is at one x. Per-group (or per-row) collapse would put it at several.
    expect(
      dateColumns([
        { due: false, plan: false },
        { due: true, plan: false },
        { due: false, plan: false },
      ]),
    ).toEqual({ due: true, plan: false })
  })

  it('reserves the two columns independently', () => {
    expect(
      dateColumns([
        { due: false, plan: true },
        { due: false, plan: false },
      ]),
    ).toEqual({ due: false, plan: true })
    expect(
      dateColumns([
        { due: true, plan: false },
        { due: false, plan: true },
      ]),
    ).toEqual({ due: true, plan: true })
  })

  it('reserves nothing for an empty list', () => {
    expect(dateColumns([])).toEqual({ due: false, plan: false })
  })
})

describe('the row template', () => {
  const cases = [
    { c: { due: true, plan: true }, tracks: '1.75rem_minmax(0,1fr)_8rem_11rem_4.5rem', action: 5 },
    { c: { due: true, plan: false }, tracks: '1.75rem_minmax(0,1fr)_8rem_4.5rem', action: 4 },
    { c: { due: false, plan: true }, tracks: '1.75rem_minmax(0,1fr)_11rem_4.5rem', action: 4 },
    { c: { due: false, plan: false }, tracks: '1.75rem_minmax(0,1fr)_4.5rem', action: 3 },
  ] as const

  it('names only the tracks the list actually reserves', () => {
    for (const { c, tracks } of cases) {
      const widest = rowGridClass(c).split(' ').at(-1)!
      expect(widest, JSON.stringify(c)).toContain(tracks)
    }
  })

  it('puts the action slot in the last track, and the plan cell after the deadline', () => {
    for (const { c, action } of cases) {
      const wide = `${rowGridClass(c)} ${actionColumnClass(c)}`
      // The stacked template is three tracks whatever the list carries, so the wide override is
      // present exactly when the wide template has more than three.
      expect(/@min-\[[0-9.]+rem\]:col-start-/.test(wide), JSON.stringify(c)).toBe(action > 3)
      if (action > 3) expect(wide).toContain(`@min-[${rowStackBelowRem(c)}rem]:col-start-${action}`)
    }
    expect(planColumnClass({ due: true, plan: true })).toContain('@min-[53.5rem]:col-start-4')
    expect(planColumnClass({ due: false, plan: true })).toContain('@min-[36rem]:col-start-3')
    expect(dueColumnClass({ due: true, plan: true })).toContain('@min-[53.5rem]:col-start-3')
    expect(dueColumnClass({ due: true, plan: false })).toContain('@min-[30rem]:col-start-3')
  })
})

describe('the list measure', () => {
  /**
   * THE DEFECT THIS REPLACES: the measure used to STEP DOWN as columns appeared -- 64rem for a
   * title-only list, 47rem the moment one row had a date -- so a project with a single deadline
   * anywhere in it had its titles clamped back to 276px inside an 1134px panel. The measure is a
   * SUM: the title track is a constant and the list widens to carry the columns that exist.
   */
  it('is marker + a CONSTANT title track + the columns that exist + the action slot', () => {
    for (const c of ALL) {
      const measured = remIn(listMeasureClass(c), 'max-w-')
      expect(measured, `${JSON.stringify(c)} -> ${listMeasureClass(c)}`).toBe(listMeasureRem(c))
      // ...and the width left for the title is the SAME number whatever the columns are, which is
      // the whole ruling: a title truncates at one width, not at two.
      expect(measured! - furnitureRem(c), JSON.stringify(c)).toBeCloseTo(TITLE_BASELINE_REM, 10)
    }
  })

  it('never narrows as a column appears, and keeps the shipped title-only measure', () => {
    // No regression on the case that was already right: a title-only list is still 64rem.
    expect(listMeasureClass({ due: false, plan: false })).toBe('max-w-[64rem]')
    const bare = listMeasureRem({ due: false, plan: false })
    expect(bare).toBe(64)
    for (const c of ALL) expect(listMeasureRem(c), JSON.stringify(c)).toBeGreaterThanOrEqual(bare)
    // Each column adds exactly its own width.
    // Each column adds its cell AND the gutter that separates it from what precedes it: counting
    // the cell alone leaves the title track 0.75rem narrower per column, which is a step down.
    expect(listMeasureRem({ due: true, plan: false }) - bare).toBe(8.75)
    expect(listMeasureRem({ due: false, plan: true }) - bare).toBe(11.75)
    expect(listMeasureRem({ due: true, plan: true }) - bare).toBe(20.5)
  })

  it('still answers hasDateColumn for the four sets', () => {
    expect(hasDateColumn({ due: false, plan: false })).toBe(false)
    for (const c of ALL.slice(1)) expect(hasDateColumn(c), JSON.stringify(c)).toBe(true)
  })
})

describe('the stack threshold', () => {
  /**
   * The other half of the ruling. Whether the dates sit beside the title is a question about the
   * CONTAINER, and the threshold is derived: the dates stay beside the title only while the title
   * track is at least as wide as everything else on the row put together, i.e. 2 x furniture.
   * A named breakpoint (`@xl`, 36rem) let a 734px list through and then clipped its titles.
   */
  it('is twice the row furniture, which is 53.5rem with both columns', () => {
    expect(rowStackBelowRem({ due: true, plan: true })).toBe(53.5)
    expect(rowStackBelowRem({ due: true, plan: false })).toBe(30)
    expect(rowStackBelowRem({ due: false, plan: true })).toBe(36)
    for (const c of ALL) expect(rowStackBelowRem(c), JSON.stringify(c)).toBe(2 * furnitureRem(c))
  })

  it('brackets the two panels the defect was about', () => {
    // At 1440 the project panel is ~1134px with the detail closed and ~734px with it open. The
    // threshold has to fall BETWEEN them: the narrow one stacks, the wide one keeps its columns.
    // A threshold outside this range is either the old clipping bug or a permanent second line.
    const px = rowStackBelowRem({ due: true, plan: true }) * 16
    expect(px, `${px}px`).toBeGreaterThan(734)
    expect(px, `${px}px`).toBeLessThan(1118)
  })

  it('is the SAME threshold in every class that stacks, and never above the measure', () => {
    for (const c of ALL) {
      if (!hasDateColumn(c)) continue
      const want = rowStackBelowRem(c)
      for (const [cls, where] of [
        [rowGridClass(c), 'row grid'],
        [rowDateStackClass(c), 'flat date stack'],
        [actionColumnClass(c), 'action slot'],
        [treeDateLineClass(c, true), 'tree date line (filled)'],
        [treeDateLineClass(c, false), 'tree date line (empty)'],
        [treeRowWrapClass(c), 'tree row wrap'],
        [c.due ? dueColumnClass(c) : '', 'deadline cell'],
        [c.plan ? planColumnClass(c) : '', 'plan cell'],
        [c.due ? treeDueCellClass(c) : '', 'tree deadline cell'],
        [c.plan ? treePlanCellClass(c) : '', 'tree plan cell'],
      ] as const) {
        if (cls === '') continue
        const min = remIn(cls, '@min-')
        const max = remIn(cls, '@max-')
        expect(min ?? max, `${where} ${JSON.stringify(c)}: ${cls}`).toBe(want)
        if (min !== null && max !== null) expect(min).toBe(max)
      }
      // A threshold at or above the measure would mean the columns NEVER appear.
      expect(want, JSON.stringify(c)).toBeLessThan(listMeasureRem(c))
    }
  })

  it('keys every threshold to the container, never to the viewport', () => {
    // `sm:` / `max-sm:` is what made a 1440px window keep five fixed tracks inside a 734px panel.
    for (const c of ALL) {
      for (const cls of [
        rowGridClass(c),
        rowDateStackClass(c),
        dueColumnClass(c),
        planColumnClass(c),
        actionColumnClass(c),
        treeRowWrapClass(c),
        treeDateLineClass(c, true),
        treeDateLineClass(c, false),
        treeDueCellClass(c),
        treePlanCellClass(c),
      ]) {
        expect(cls, `${JSON.stringify(c)}: ${cls}`).not.toMatch(/(^|[ :])(max-)?sm:/)
        for (const token of cls.split(' ').filter((t) => t.includes(':')))
          expect(token, `${JSON.stringify(c)}: ${cls}`).toMatch(/^@(min|max)-\[/)
      }
    }
  })

  it('leaves a title-only list with nothing to stack', () => {
    const none = { due: false, plan: false }
    expect(columnCase(none)).toBe('none')
    for (const cls of [
      rowDateStackClass(none),
      dueColumnClass(none),
      planColumnClass(none),
      actionColumnClass(none),
      treeRowWrapClass(none),
      treeDateLineClass(none, true),
      treeDueCellClass(none),
      treePlanCellClass(none),
    ])
      expect(cls).toBe('')
  })
})
