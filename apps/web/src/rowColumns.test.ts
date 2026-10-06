import { describe, expect, it } from 'vitest'
import {
  actionColumnClass,
  dateColumns,
  hasDateColumn,
  listMeasureClass,
  planColumnClass,
  rowGridClass,
} from './rowColumns'

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
      // The narrow template is three tracks whatever the list carries, so the `@xl` override is
      // present exactly when the wide template has more than three.
      expect(wide.includes('@xl:col-start-'), JSON.stringify(c)).toBe(action > 3)
      if (action > 3) expect(wide).toContain(`@xl:col-start-${action}`)
    }
    expect(planColumnClass({ due: true, plan: true })).toContain('@xl:col-start-4')
    expect(planColumnClass({ due: false, plan: true })).toContain('@xl:col-start-3')
  })
})

describe('the list measure', () => {
  it('widens a title-only list and keeps 47rem once a date column exists', () => {
    expect(listMeasureClass({ due: false, plan: false })).toBe('max-w-[64rem]')
    for (const c of [
      { due: true, plan: false },
      { due: false, plan: true },
      { due: true, plan: true },
    ]) {
      expect(listMeasureClass(c), JSON.stringify(c)).toBe('max-w-[47rem]')
      expect(hasDateColumn(c)).toBe(true)
    }
    expect(hasDateColumn({ due: false, plan: false })).toBe(false)
  })
})
