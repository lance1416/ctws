import { describe, expect, it } from 'vitest'
import { columnsIn, inColumns, splitColumns } from './columns'

// The main area's width on each screen: the window less the 52 icon bar and the 20 on each side.
const MAIN = (screen: number) => screen - 52 - 40

describe('columnsIn', () => {
  it('gives the three screens the columns DES-001 names for them', () => {
    expect(columnsIn(MAIN(1440))).toBe(3)
    expect(columnsIn(MAIN(1920))).toBe(4)
    expect(columnsIn(MAIN(2560))).toBe(6)
  })

  it('counts a column only when all 360 of it fit, gaps included', () => {
    expect(columnsIn(360 * 3 + 12 * 2)).toBe(3)
    expect(columnsIn(360 * 3 + 12 * 2 - 1)).toBe(2)
  })

  it('never drops below one column or goes past six', () => {
    expect(columnsIn(200)).toBe(1)
    expect(columnsIn(0)).toBe(1)
    expect(columnsIn(5000)).toBe(6)
  })
})

describe('splitColumns', () => {
  it('gives the main blocks half the columns and the rest beside them (DES-001 section 4)', () => {
    // 1440, 1920 and 2560.
    expect(splitColumns(3)).toEqual({ main: 2, side: 1 })
    expect(splitColumns(4)).toEqual({ main: 2, side: 2 })
    expect(splitColumns(6)).toEqual({ main: 3, side: 3 })
    expect(splitColumns(5)).toEqual({ main: 3, side: 2 })
  })

  it('puts the side blocks under the main ones when there is no room beside them', () => {
    expect(splitColumns(2)).toEqual({ main: 2, side: 2 })
    expect(splitColumns(1)).toEqual({ main: 1, side: 1 })
  })
})

describe('inColumns', () => {
  const FOUR = ['Follow up', 'Ready', 'This week', 'Birthdays']

  it('lays the four side blocks out as artboard 31 does: the last two share a column', () => {
    expect(inColumns(FOUR, 3)).toEqual([['Follow up'], ['Ready'], ['This week', 'Birthdays']])
  })

  it('stacks them all in one column, and halves them across two, in order', () => {
    expect(inColumns(FOUR, 1)).toEqual([FOUR])
    expect(inColumns(FOUR, 2)).toEqual([
      ['Follow up', 'Ready'],
      ['This week', 'Birthdays'],
    ])
    expect(inColumns(['a', 'b', 'c'], 2)).toEqual([['a'], ['b', 'c']])
  })

  it('gives each its own column while there are columns, from the left', () => {
    expect(inColumns(['a', 'b'], 3)).toEqual([['a'], ['b']])
    expect(inColumns([], 3)).toEqual([])
  })
})
