import { describe, expect, it } from 'vitest'
import { inColumns, todayColumns } from './dayColumns'

describe('todayColumns', () => {
  it('gives the task blocks half the columns and the rest beside them (DES-001 section 4)', () => {
    // 1440, 1920 and 2560.
    expect(todayColumns(3)).toEqual({ tasks: 2, side: 1 })
    expect(todayColumns(4)).toEqual({ tasks: 2, side: 2 })
    expect(todayColumns(6)).toEqual({ tasks: 3, side: 3 })
    expect(todayColumns(5)).toEqual({ tasks: 3, side: 2 })
  })

  it('puts the side blocks under the task blocks when there is no room beside them', () => {
    expect(todayColumns(2)).toEqual({ tasks: 2, side: 2 })
    expect(todayColumns(1)).toEqual({ tasks: 1, side: 1 })
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
