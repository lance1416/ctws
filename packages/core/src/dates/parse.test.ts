import { describe, expect, it } from 'vitest'
import { daysInMonth, parseDay, parseMonth } from './parse'

// A Wednesday.
const TODAY = '2026-10-21'

describe('parseDay (FR-034)', () => {
  it("reads the ways the requirement lists, and today's words", () => {
    expect(parseDay('Oct 29', TODAY)).toBe('2026-10-29')
    expect(parseDay('29 Oct', TODAY)).toBe('2026-10-29')
    expect(parseDay('29/10', TODAY)).toBe('2026-10-29')
    expect(parseDay('2026-10-29', TODAY)).toBe('2026-10-29')
    expect(parseDay('tomorrow', TODAY)).toBe('2026-10-22')
    expect(parseDay('fri', TODAY)).toBe('2026-10-23')
    expect(parseDay('today', TODAY)).toBe(TODAY)
    expect(parseDay('next week', TODAY)).toBe('2026-10-26')
    expect(parseDay('in 3 days', TODAY)).toBe('2026-10-24')
  })

  it('takes a weekday as the coming one, today included, and "next" as the one after', () => {
    expect(parseDay('wed', TODAY)).toBe(TODAY)
    expect(parseDay('next wed', TODAY)).toBe('2026-10-28')
    expect(parseDay('Monday', TODAY)).toBe('2026-10-26')
    expect(parseDay('next monday', TODAY)).toBe('2026-11-02')
  })

  it('puts a month and day without a year on the next such day', () => {
    expect(parseDay('Jan 5', TODAY)).toBe('2027-01-05')
    expect(parseDay('5/1', TODAY)).toBe('2027-01-05')
    expect(parseDay('Oct 21', TODAY)).toBe('2026-10-21')
    expect(parseDay('29 Feb', TODAY)).toBe('2028-02-29')
    expect(parseDay('Mar 3 2024', TODAY)).toBe('2024-03-03')
    expect(parseDay('3/3/24', TODAY)).toBe('2024-03-03')
  })

  it('refuses words that are not a day, and days that do not exist', () => {
    expect(parseDay('', TODAY)).toBeNull()
    expect(parseDay('soon', TODAY)).toBeNull()
    expect(parseDay('31/4', TODAY)).toBeNull()
    expect(parseDay('2027-02-29', TODAY)).toBeNull()
    expect(parseDay('Foo 3', TODAY)).toBeNull()
    expect(parseDay('13/13', TODAY)).toBeNull()
  })
})

describe('parseMonth', () => {
  it('reads a month with or without its year', () => {
    expect(parseMonth('Mar 2023', TODAY)).toBe('2023-03')
    expect(parseMonth('2023-03', TODAY)).toBe('2023-03')
    expect(parseMonth('03/2023', TODAY)).toBe('2023-03')
    expect(parseMonth('March', TODAY)).toBe('2026-03')
    expect(parseMonth('now', TODAY)).toBe('2026-10')
    expect(parseMonth('13/2023', TODAY)).toBeNull()
    expect(parseMonth('Mar 3', TODAY)).toBeNull()
  })
})

it('knows the length of every month', () => {
  expect(daysInMonth(2026, 2)).toBe(28)
  expect(daysInMonth(2028, 2)).toBe(29)
  expect(daysInMonth(2026, 12)).toBe(31)
})
