import { describe, expect, it } from 'vitest'
import { repeatChoices, repeatLabel, untilOf, withUntil } from './meetings'

/**
 * WHAT A STORED RULE IS CALLED.
 *
 * The column takes any valid `RRULE`, and the picker offers five. Everything else still has to be
 * said in words: an RFC string on screen is the data model leaking into the page, and a rule
 * described wrongly is worse than one described generically.
 */
/** A Tuesday, so the weekly choices are named after it. */
const TUESDAY = '2026-10-20T09:00'
/** The reader's own day, handed in rather than read off the clock, so every case runs on every run. */
const TODAY = '2026-10-10'

describe('repeatLabel', () => {
  it('uses the picker own wording for a rule the picker offers', () => {
    for (const choice of repeatChoices(TUESDAY)) {
      expect(repeatLabel(choice.value, TUESDAY, TODAY)).toBe(choice.label)
    }
  })

  it('says nothing repeats when nothing does', () => {
    expect(repeatLabel(null, TUESDAY, TODAY)).toBe('Does not repeat')
  })

  it('names the days of a weekly rule that lists several', () => {
    // "Every week" is true of this rule and useless about the meeting: a weekday standup does not
    // happen weekly, it happens five times a week.
    expect(repeatLabel('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', TUESDAY, TODAY)).toBe(
      'Weekly on Mon, Tue, Wed, Thu, Fri',
    )
    expect(repeatLabel('FREQ=WEEKLY;BYDAY=TU,TH', TUESDAY, TODAY)).toBe('Weekly on Tue, Thu')
  })

  it('falls back to the interval, and to one plain word when it cannot read the rule', () => {
    expect(repeatLabel('FREQ=DAILY;INTERVAL=3', TUESDAY, TODAY)).toBe('Every 3 days')
    expect(repeatLabel('FREQ=YEARLY', TUESDAY, TODAY)).toBe('Every year')
    // A frequency this interface has no word for is still not shown as an RFC string.
    expect(repeatLabel('FREQ=HOURLY', TUESDAY, TODAY)).toBe('Custom')
  })
})

describe('repeatChoices', () => {
  it('names the weekly choices after the day the meeting falls on', () => {
    const tuesday = repeatChoices('2026-10-20T09:00').map((c) => c.label)
    expect(tuesday).toContain('Weekly on Tuesday')
    expect(tuesday).toContain('Every two weeks on Tuesday')
    const friday = repeatChoices('2026-10-23T09:00').map((c) => c.label)
    expect(friday).toContain('Weekly on Friday')
  })

  it('writes the day of a monthly rule as an ordinal', () => {
    expect(repeatChoices('2026-10-01T09:00').map((c) => c.label)).toContain('Monthly on the 1st')
    expect(repeatChoices('2026-10-02T09:00').map((c) => c.label)).toContain('Monthly on the 2nd')
    expect(repeatChoices('2026-10-03T09:00').map((c) => c.label)).toContain('Monthly on the 3rd')
    expect(repeatChoices('2026-10-11T09:00').map((c) => c.label)).toContain('Monthly on the 11th')
    expect(repeatChoices('2026-10-21T09:00').map((c) => c.label)).toContain('Monthly on the 21st')
  })
})

/**
 * WHEN A REPEAT STOPS.
 *
 * `UNTIL` lives in the same naive space as the series' own start, which `occurrences.ts` builds
 * from the wall clock and stamps `Z`. These pin the two halves of that: the stamp written, and
 * the day read back out of it.
 */
describe('until', () => {
  const WEEKLY = 'FREQ=WEEKLY;BYDAY=TU'

  it('ends on the END of the chosen day, where the meeting is', () => {
    // 23:59:59 and not 00:00:00: a person picking the 31st means the 31st included. Midnight
    // would drop the last occurrence of a series that meets in the afternoon.
    expect(withUntil(WEEKLY, '2026-12-31')).toBe('FREQ=WEEKLY;BYDAY=TU;UNTIL=20261231T235959Z')
  })

  it('reads the day back out', () => {
    expect(untilOf('FREQ=WEEKLY;BYDAY=TU;UNTIL=20261231T235959Z')).toBe('2026-12-31')
    expect(untilOf(WEEKLY)).toBeNull()
    expect(untilOf(null)).toBeNull()
  })

  it('replaces an ending rather than stacking a second one', () => {
    const once = withUntil(WEEKLY, '2026-12-31')
    const twice = withUntil(once, '2027-01-15')
    expect(twice).toBe('FREQ=WEEKLY;BYDAY=TU;UNTIL=20270115T235959Z')
    expect(untilOf(twice)).toBe('2027-01-15')
  })

  it('takes the ending off again', () => {
    expect(withUntil(withUntil(WEEKLY, '2026-12-31'), null)).toBe(WEEKLY)
  })

  it('still names a rule that has an ending', () => {
    // Without this the picker's own wording is lost the moment a rule stops: the label falls
    // through to the generic branch and a weekly meeting reads as "Every week".
    expect(repeatLabel(withUntil('FREQ=WEEKLY;BYDAY=TU', '2026-12-31'), TUESDAY, TODAY)).toBe(
      'Weekly on Tuesday, until Dec 31',
    )
    expect(repeatLabel(withUntil('FREQ=DAILY', '2027-03-01'), TUESDAY, TODAY)).toBe(
      'Daily, until Mar 1, 2027',
    )
  })

  /**
   * THE ENDING IS WORDED AGAINST A DAY THAT IS HANDED IN, not against the process clock.
   *
   * The year is dropped when the ending falls in the reader's own year, which is the rule every
   * other date in this app follows -- and that rule needs to know which year the READER is in.
   * `repeatLabel` used to answer it with `new Date().getFullYear()`, so this very test had to be
   * rewritten each January, and the browser's year was consulted where the ACCOUNT's zone decides
   * every other day boundary. Both assertions below are true forever, which is the point.
   */
  it('drops the year of an ending in the given year and keeps any other', () => {
    const rule = withUntil('FREQ=WEEKLY;BYDAY=TU', '2026-12-31')
    expect(repeatLabel(rule, TUESDAY, '2026-10-10')).toBe('Weekly on Tuesday, until Dec 31')
    expect(repeatLabel(rule, TUESDAY, '2027-01-04')).toBe('Weekly on Tuesday, until Dec 31, 2026')
    expect(repeatLabel(rule, TUESDAY, '2025-12-30')).toBe('Weekly on Tuesday, until Dec 31, 2026')
  })
})
