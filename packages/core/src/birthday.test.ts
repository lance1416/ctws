import { describe, expect, it } from 'vitest'
import { factsOf, HOUR_BRANCHES, lunarDayLabel, nextOccurrence, type Birthday } from './birthday'

/** 2026-10-10 是这些测试里的「今天」：农历丙午年九月初一。 */
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
  it('公历生日：今天就是生日时倒数为 0', () => {
    expect(nextOccurrence(solar(1993, 10, 10), TODAY)).toEqual({
      day: '2026-10-10',
      inDays: 0,
      turns: 33,
      kept: [],
    })
  })

  it('公历生日：已经过了就排到明年', () => {
    expect(nextOccurrence(solar(1996, 4, 15), TODAY)).toEqual({
      day: '2027-04-15',
      inDays: 187,
      turns: 31,
      kept: [],
    })
  })

  it('农历生日：按农历日复发，公历日期每年不同', () => {
    // 1991 年农历九月初三 = 公历 1991-10-10；2026 年的九月初三是 10-12。
    expect(nextOccurrence(lunar(1991, 9, 3), TODAY)).toEqual({
      day: '2026-10-12',
      inDays: 2,
      turns: 35,
      kept: [],
    })
  })

  /** Review Focus 1：跨农历新年，年龄按农历年算。按公历年减会得 83。 */
  it('农历十二月的生日落在次年公历，年龄仍按农历年', () => {
    expect(nextOccurrence(lunar(1944, 12, 30), TODAY)).toEqual({
      day: '2027-02-05',
      inDays: 118,
      turns: 82,
      kept: ['short-month'],
    })
  })

  it('闰月生的人，在没有该闰月的年份过正常月', () => {
    // 2017 年有闰六月；2027 年没有，所以记在六月十五。
    expect(nextOccurrence(lunar(2017, 6, 15, true), TODAY)).toEqual({
      day: '2027-07-18',
      inDays: 281,
      turns: 10,
      kept: ['leap-month'],
    })
  })

  it('闰月生的人，遇上有该闰月的年份就过闰月', () => {
    // 2017-08-06 是农历丁酉年闰六月十五本身。
    expect(nextOccurrence(lunar(2017, 6, 15, true), '2017-01-01')).toEqual({
      day: '2017-08-06',
      inDays: 217,
      turns: 0,
      kept: [],
    })
  })

  /** Review Focus 2：四年里三年没有 2 月 29 日。 */
  it('2 月 29 日生的人，在平年记在 28 日', () => {
    expect(nextOccurrence(solar(2000, 2, 29), '2026-03-01')).toEqual({
      day: '2027-02-28',
      inDays: 364,
      turns: 27,
      kept: ['short-february'],
    })
  })

  it('2 月 29 日生的人，在闰年就是 29 日', () => {
    expect(nextOccurrence(solar(2000, 2, 29), '2028-01-01')).toEqual({
      day: '2028-02-29',
      inDays: 59,
      turns: 28,
      kept: [],
    })
  })

  it('没有年份时不报年龄', () => {
    expect(nextOccurrence(solar(null, 11, 2), TODAY)).toEqual({
      day: '2026-11-02',
      inDays: 23,
      turns: null,
      kept: [],
    })
  })
})

describe('factsOf', () => {
  /** 本文件最重要的一条：生肖按农历年（正月初一换岁），不是干支年（立春换岁）。 */
  it('正月初一出生的人就是新一年的属相', () => {
    // 2025-01-29 是农历乙巳年正月初一；立春在 2 月 3 日。
    expect(factsOf(solar(2025, 1, 29), null).zodiac).toBe('蛇')
    expect(factsOf(solar(2025, 1, 28), null).zodiac).toBe('龙')
  })

  it('公历生日给出农历出生日、生肖与星座', () => {
    expect(factsOf(solar(1996, 4, 15), 6)).toEqual({
      lunarDate: null,
      bornSolar: '1996-04-15',
      bornLunar: '农历丙子年二月廿八',
      zodiac: '鼠',
      sign: '白羊',
      hour: '午时 · 11–13',
    })
  })

  it('农历生日给出它自己的复发日与公历出生日', () => {
    expect(factsOf(lunar(1991, 9, 3), null)).toEqual({
      lunarDate: '农历九月初三',
      bornSolar: '1991-10-10',
      bornLunar: '农历辛未年九月初三',
      zodiac: '羊',
      sign: '天秤',
      hour: null,
    })
  })

  it('闰月生日的复发日写明闰字', () => {
    expect(factsOf(lunar(2017, 6, 15, true), null).lunarDate).toBe('农历闰六月十五')
  })

  it('没有年份的公历生日仍有星座，但没有生肖', () => {
    const facts = factsOf(solar(null, 11, 2), null)
    expect(facts.sign).toBe('天蝎')
    expect(facts.zodiac).toBeNull()
    expect(facts.bornSolar).toBeNull()
  })

  /** Review Focus 3：农历月日对应的公历日期逐年移动，星座不唯一。 */
  it('没有年份的农历生日连星座都没有', () => {
    const facts = factsOf(lunar(null, 9, 3), null)
    expect(facts.sign).toBeNull()
    expect(facts.zodiac).toBeNull()
    expect(facts.lunarDate).toBe('农历九月初三')
  })

  it('时辰是十二个地支，带钟点区间', () => {
    expect(HOUR_BRANCHES).toHaveLength(12)
    expect(HOUR_BRANCHES[0]).toBe('子时 · 23–01')
    expect(HOUR_BRANCHES[11]).toBe('亥时 · 21–23')
    expect(factsOf(solar(1996, 4, 15), 0).hour).toBe('子时 · 23–01')
  })
})

describe('lunarDayLabel', () => {
  it('月初写月名，其余只写日', () => {
    expect(lunarDayLabel('2026-10-10')).toBe('九月初一')
    expect(lunarDayLabel('2026-10-12')).toBe('初三')
  })
})
