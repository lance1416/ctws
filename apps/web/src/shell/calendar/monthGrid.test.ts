import { describe, expect, it } from 'vitest'
import {
  lunarMonthsOf,
  lunarSquareName,
  monthRange,
  monthSquares,
  monthTitle,
  shiftMonth,
} from './monthGrid'

describe('shiftMonth', () => {
  it('lands on the first of the month, whatever day it started from', () => {
    expect(shiftMonth('2026-10-31', 1)).toBe('2026-11-01')
    expect(shiftMonth('2026-01-15', -1)).toBe('2025-12-01')
  })

  it('does not overflow a short month', () => {
    // The 31st + one month is the trap: naive arithmetic gives 2026-03-03.
    expect(shiftMonth('2026-01-31', 1)).toBe('2026-02-01')
  })
})

describe('monthSquares', () => {
  it('is whole weeks, and never a row that is entirely another month', () => {
    for (const month of ['2026-02-01', '2026-10-01', '2026-11-01', '2028-02-01', '2027-08-01']) {
      const squares = monthSquares(month)
      expect(squares.length % 7, month).toBe(0)
      const lastWeek = squares.slice(-7)
      expect(
        lastWeek.some((s) => s.inMonth),
        `${month}: last row is entirely another month`,
      ).toBe(true)
    }
  })

  it('grows to six weeks when the month really needs them', () => {
    // 2026-08-01 is a Saturday: one lead day plus 31 makes 32, which does not fit in five weeks.
    expect(monthSquares('2026-08-10')).toHaveLength(42)
    // 2026-10 fits in five -- the sixth row would be all November.
    expect(monthSquares('2026-10-10')).toHaveLength(35)
  })

  it('starts on a Monday and shows the neighbours rather than blanks', () => {
    // 2026-10-01 is a Thursday, so the grid opens on Monday Sep 28.
    const squares = monthSquares('2026-10-15')
    expect(squares[0]).toEqual({ day: '2026-09-28', inMonth: false })
    expect(squares[3]).toEqual({ day: '2026-10-01', inMonth: true })
    expect(squares[squares.length - 1]!.inMonth).toBe(false)
  })

  it('marks exactly the days of the month it was asked for', () => {
    const inMonth = monthSquares('2026-02-10').filter((s) => s.inMonth)
    expect(inMonth).toHaveLength(28)
    expect(inMonth[0]!.day).toBe('2026-02-01')
    expect(inMonth[27]!.day).toBe('2026-02-28')
  })

  it('needs no leading days when the month already starts on a Monday', () => {
    // 2026-06-01 is a Monday: the first square is the first of the month.
    expect(monthSquares('2026-06-10')[0]).toEqual({ day: '2026-06-01', inMonth: true })
  })
})

describe('monthRange', () => {
  it('spans the whole drawn grid, not just the month', () => {
    // The window the server is asked for must cover the neighbour days that are on screen, or
    // they render empty and a deadline appears to vanish at a month boundary.
    expect(monthRange('2026-10-15')).toEqual({ from: '2026-09-28', to: '2026-11-01' })
  })
})

describe('monthTitle', () => {
  it('is written the way a person says it', () => {
    expect(monthTitle('2026-10-15')).toBe('October 2026')
    expect(monthTitle('2026-01-01')).toBe('January 2026')
  })
})

describe('lunarMonthsOf', () => {
  const days = {
    '2026-09-30': '二十',
    '2026-10-01': '廿一',
    '2026-10-10': '九月初一',
    '2026-10-11': '初二',
  }

  it('names the month the first day is in, then each that begins inside the month', () => {
    expect(lunarMonthsOf('八月廿一', days, '2026-10')).toEqual(['八月', '九月'])
  })

  it('names only those it knows while the first day is not yet named', () => {
    expect(lunarMonthsOf(null, days, '2026-10')).toEqual(['九月'])
  })

  it('does not count a month that begins on a neighbouring square', () => {
    expect(lunarMonthsOf('九月廿一', { ...days, '2026-11-09': '十月初一' }, '2026-10')).toEqual([
      '九月',
    ])
  })
})

describe('lunarSquareName', () => {
  it('says the festival before anything else', () => {
    expect(lunarSquareName('初九', '重阳')).toEqual({ text: '重阳', is: 'festival' })
  })

  it('says the month on its first day, and the day otherwise', () => {
    expect(lunarSquareName('九月初一', undefined)).toEqual({ text: '九月', is: 'month' })
    expect(lunarSquareName('十三', undefined)).toEqual({ text: '十三', is: 'day' })
  })

  it('says nothing for a day not yet named', () => {
    expect(lunarSquareName(undefined, undefined)).toBeNull()
  })
})
