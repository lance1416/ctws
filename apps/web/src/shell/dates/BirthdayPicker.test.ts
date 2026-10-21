import { describe, expect, it } from 'vitest'
import { lunarYearOf } from './BirthdayPicker'

describe('lunarYearOf', () => {
  it('keeps the solar year for a day after the lunar new year', () => {
    // 正月初一 of 1944 is 25 January 1944.
    expect(lunarYearOf('1944-01-25', 1)).toBe(1944)
    expect(lunarYearOf('1944-12-14', 11)).toBe(1944)
  })

  it('gives the year before for the last months that run on into January and February', () => {
    // 十二月三十 of 1944 is 12 February 1945; 十一月 of 1944 ends in January 1945.
    expect(lunarYearOf('1945-02-12', 12)).toBe(1944)
    expect(lunarYearOf('1945-01-10', 11)).toBe(1944)
  })
})
