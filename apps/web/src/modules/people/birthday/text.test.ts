import { describe, expect, it } from 'vitest'
import type { BirthdayDraft } from '../api'
import { plainDate } from './text'

const draft = (over: Partial<BirthdayDraft>): BirthdayDraft => ({
  calendar: 'solar',
  year: null,
  month: 10,
  day: 17,
  leapMonth: false,
  hourBranch: null,
  remindLead: 7,
  ...over,
})

describe('a birthday draft in one line', () => {
  it('says a solar day the way the app says any day, with the year when there is one', () => {
    expect(plainDate(draft({ year: 1991 }))).toBe('Oct 17, 1991')
    expect(plainDate(draft({}))).toBe('Oct 17')
  })

  it('says a lunar day in its own names, the year first when there is one', () => {
    expect(plainDate(draft({ calendar: 'lunar', year: 1991, month: 1, day: 15 }))).toBe(
      '1991 正月 十五',
    )
    expect(plainDate(draft({ calendar: 'lunar', month: 12, day: 30 }))).toBe('十二月 三十')
  })

  it('marks a leap month', () => {
    expect(plainDate(draft({ calendar: 'lunar', month: 4, day: 1, leapMonth: true }))).toBe(
      '闰四月 初一',
    )
  })
})
