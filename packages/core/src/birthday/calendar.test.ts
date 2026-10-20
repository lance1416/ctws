import { describe, expect, it } from 'vitest'
import {
  birthdayProblem,
  factsOf,
  keptNote,
  lunarDayLabel,
  nextOccurrence,
  type Birthday,
} from './calendar'

/** "Today" in these tests: 九月初一 of the lunar year 丙午. */
const TODAY = '2026-10-10'

const solar = (year: number | null, month: number, day: number): Birthday => ({
  calendar: 'solar',
  year,
  month,
  day,
  leapMonth: false,
})
const lunar = (year: number | null, month: number, day: number, leapMonth = false): Birthday => ({
  calendar: 'lunar',
  year,
  month,
  day,
  leapMonth,
})

describe('nextOccurrence', () => {
  it('a solar birthday today is 0 days away', () => {
    expect(nextOccurrence(solar(1993, 10, 10), TODAY)).toEqual({
      day: '2026-10-10',
      inDays: 0,
      turns: 33,
      kept: [],
    })
  })

  it('a solar birthday already past is next year', () => {
    expect(nextOccurrence(solar(1996, 4, 15), TODAY)).toEqual({
      day: '2027-04-15',
      inDays: 187,
      turns: 31,
      kept: [],
    })
  })

  it('a lunar birthday recurs on its lunar day, a different solar day each year', () => {
    // 九月初三 was 1991-10-10; in 2026 it is 10-12.
    expect(nextOccurrence(lunar(1991, 9, 3), TODAY)).toEqual({
      day: '2026-10-12',
      inDays: 2,
      turns: 35,
      kept: [],
    })
  })

  // By solar year the age would be 83.
  it('a 12th-month lunar birthday falls in the next solar year and counts age by lunar year', () => {
    expect(nextOccurrence(lunar(1944, 12, 30), TODAY)).toEqual({
      day: '2027-02-05',
      inDays: 118,
      turns: 82,
      kept: ['short-month'],
    })
  })

  it('a leap-month birthday is kept in the ordinary month in a year without that leap month', () => {
    // 2017 had a leap 6th month; 2027 does not.
    expect(nextOccurrence(lunar(2017, 6, 15, true), TODAY)).toEqual({
      day: '2027-07-18',
      inDays: 281,
      turns: 10,
      kept: ['leap-month'],
    })
  })

  it('a leap-month birthday falls in the leap month when the year has it', () => {
    // 2017-08-06 is 闰六月十五 itself.
    expect(nextOccurrence(lunar(2017, 6, 15, true), '2017-01-01')).toEqual({
      day: '2017-08-06',
      inDays: 217,
      turns: 0,
      kept: [],
    })
  })

  it('a 29 February birthday is kept on the 28th in a common year', () => {
    expect(nextOccurrence(solar(2000, 2, 29), '2026-03-01')).toEqual({
      day: '2027-02-28',
      inDays: 364,
      turns: 27,
      kept: ['short-february'],
    })
  })

  it('a 29 February birthday is the 29th in a leap year', () => {
    expect(nextOccurrence(solar(2000, 2, 29), '2028-01-01')).toEqual({
      day: '2028-02-29',
      inDays: 59,
      turns: 28,
      kept: [],
    })
  })

  it('gives no age without a year', () => {
    expect(nextOccurrence(solar(null, 11, 2), TODAY)).toEqual({
      day: '2026-11-02',
      inDays: 23,
      turns: null,
      kept: [],
    })
  })
})

describe('factsOf', () => {
  // The zodiac turns at the lunar new year, not at 立春.
  it('someone born on the lunar new year takes the new zodiac', () => {
    // 2025-01-29 is 乙巳 正月初一; 立春 is on 3 February.
    expect(factsOf(solar(2025, 1, 29), null).zodiac).toBe('蛇')
    expect(factsOf(solar(2025, 1, 28), null).zodiac).toBe('龙')
  })

  it('derives the lunar birth date, zodiac and sign of a solar birthday', () => {
    expect(factsOf(solar(1996, 4, 15), 6)).toEqual({
      lunarDate: null,
      bornSolar: '1996-04-15',
      bornLunar: '农历丙子年二月廿八',
      zodiac: '鼠',
      sign: '白羊',
      hour: '午时 · 11–13',
    })
  })

  it('derives the recurring date and solar birth day of a lunar birthday', () => {
    expect(factsOf(lunar(1991, 9, 3), null)).toEqual({
      lunarDate: '农历九月初三',
      bornSolar: '1991-10-10',
      bornLunar: '农历辛未年九月初三',
      zodiac: '羊',
      sign: '天秤',
      hour: null,
    })
  })

  it('marks a leap-month recurring date with 闰', () => {
    expect(factsOf(lunar(2017, 6, 15, true), null).lunarDate).toBe('农历闰六月十五')
  })

  it('gives a solar birthday without a year a sign but no zodiac', () => {
    const facts = factsOf(solar(null, 11, 2), null)
    expect(facts.sign).toBe('天蝎')
    expect(facts.zodiac).toBeNull()
    expect(facts.bornSolar).toBeNull()
  })

  // Its solar date moves from year to year, across signs.
  it('gives a lunar birthday without a year no sign either', () => {
    const facts = factsOf(lunar(null, 9, 3), null)
    expect(facts.sign).toBeNull()
    expect(facts.zodiac).toBeNull()
    expect(facts.lunarDate).toBe('农历九月初三')
  })

  it('names the double-hour with its clock span', () => {
    expect(factsOf(solar(1996, 4, 15), 0).hour).toBe('子时 · 23–01')
  })
})

describe('lunarDayLabel', () => {
  it('names the month on its first day and only the day otherwise', () => {
    expect(lunarDayLabel('2026-10-10')).toBe('九月初一')
    expect(lunarDayLabel('2026-10-12')).toBe('初三')
  })
})

describe('keptNote', () => {
  it('says which year lacks the leap month and where the day is kept', () => {
    const b = lunar(2017, 6, 15, true)
    expect(keptNote(b, nextOccurrence(b, TODAY))).toBe(
      'No 闰六月 in 2027, so it is kept on 六月十五.',
    )
  })

  it('says how many days the short month has', () => {
    const b = lunar(1944, 12, 30)
    expect(keptNote(b, nextOccurrence(b, TODAY))).toBe(
      '十二月 has 29 days in 2027, so it is kept on 十二月廿九.',
    )
  })

  it('says February for a 29 February birthday in a common year', () => {
    const b = solar(2000, 2, 29)
    expect(keptNote(b, nextOccurrence(b, '2026-03-01'))).toBe(
      'February has 28 days in 2027, so it is kept on the 28th.',
    )
  })

  it('says nothing when the day did not move', () => {
    const b = solar(1996, 4, 15)
    expect(keptNote(b, nextOccurrence(b, TODAY))).toBeNull()
  })
})

// Whether 正月三十 or a 闰六月 existed depends on the year, which only the library knows.
describe('birthdayProblem', () => {
  it('says the lunar month had no 30th that year', () => {
    expect(birthdayProblem(lunar(2021, 1, 30))).toBe(
      '正月 has 29 days in 2021, so there is no 三十.',
    )
  })

  it('says the year had no such leap month', () => {
    expect(birthdayProblem(lunar(2018, 6, 15, true))).toBe('There is no 闰六月 in 2018.')
  })

  it('says a common year has no 29 February', () => {
    expect(birthdayProblem(solar(2001, 2, 29))).toBe(
      'February has 28 days in 2001, so there is no 29th.',
    )
  })

  it('passes days that existed', () => {
    expect(birthdayProblem(lunar(1944, 12, 30))).toBeNull()
    expect(birthdayProblem(lunar(2017, 6, 30, true))).toBeNull()
    expect(birthdayProblem(solar(2000, 2, 29))).toBeNull()
    expect(birthdayProblem(solar(1996, 4, 15))).toBeNull()
  })

  it('passes any day without a year', () => {
    expect(birthdayProblem(lunar(null, 1, 30))).toBeNull()
    expect(birthdayProblem(solar(null, 2, 29))).toBeNull()
  })
})

describe('factsOf on a day that never existed', () => {
  // A stored row can predate the check; throwing would fail every list that shows it.
  it('derives nothing rather than throwing', () => {
    const facts = factsOf(lunar(2021, 1, 30), null)
    expect(facts.bornSolar).toBeNull()
    expect(facts.bornLunar).toBeNull()
    expect(facts.zodiac).toBeNull()
    expect(facts.sign).toBeNull()
    expect(facts.lunarDate).toBe('农历正月三十')
  })
})

describe('the recurring date', () => {
  it('keeps a 30th as the 30th whatever a given year holds', () => {
    // 九月 of lunar 2000 had 29 days, but a recurring date has no year.
    expect(factsOf(lunar(1990, 9, 30), null).lunarDate).toBe('农历九月三十')
    expect(factsOf(lunar(1944, 12, 30), null).lunarDate).toBe('农历十二月三十')
  })
})

describe('keptNote names every move', () => {
  it('says both when the leap month is missing and the month is short', () => {
    // 闰六月 had 30 days in 2017; 2027 has no 闰六月 and its 六月 has 29.
    const b = lunar(2017, 6, 30, true)
    const occ = nextOccurrence(b, TODAY)
    expect(occ.kept).toEqual(['leap-month', 'short-month'])
    expect(keptNote(b, occ)).toBe(
      'No 闰六月 in 2027, and 六月 has 29 days there, so it is kept on 六月廿九.',
    )
  })

  it('measures the leap month when the day falls in it', () => {
    // 闰六月 had 30 days in 1979; in 2025 it has 29 while 六月 has 30.
    const b = lunar(1979, 6, 30, true)
    const occ = nextOccurrence(b, '2025-03-01')
    expect(occ.kept).toEqual(['short-month'])
    expect(keptNote(b, occ)).toBe('闰六月 has 29 days in 2025, so it is kept on 闰六月廿九.')
  })
})
