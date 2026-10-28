import { ruleEndDay } from '@ctws/contracts'
import { describe, expect, it } from 'vitest'
import { followStart, repeatChoices, repeatLabel, withUntil } from './api'

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
    // A weekday standup happens five times a week, which "Every week" does not say.
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
    expect(tuesday).toContain('Every other Tuesday')
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

// `UNTIL` is in the series start's naive wall-clock space, stamped `Z`.
describe('until', () => {
  const WEEKLY = 'FREQ=WEEKLY;BYDAY=TU'

  it('ends on the END of the chosen day, where the meeting is', () => {
    // Not midnight: picking the 31st means the 31st included, afternoon meeting and all.
    expect(withUntil(WEEKLY, '2026-12-31')).toBe('FREQ=WEEKLY;BYDAY=TU;UNTIL=20261231T235959Z')
  })

  it('reads the day back out', () => {
    expect(ruleEndDay('FREQ=WEEKLY;BYDAY=TU;UNTIL=20261231T235959Z')).toBe('2026-12-31')
    expect(ruleEndDay(WEEKLY)).toBeNull()
    expect(ruleEndDay(null)).toBeNull()
  })

  it('replaces an ending rather than stacking a second one', () => {
    const once = withUntil(WEEKLY, '2026-12-31')
    const twice = withUntil(once, '2027-01-15')
    expect(twice).toBe('FREQ=WEEKLY;BYDAY=TU;UNTIL=20270115T235959Z')
    expect(ruleEndDay(twice)).toBe('2027-01-15')
  })

  it('takes the ending off again', () => {
    expect(withUntil(withUntil(WEEKLY, '2026-12-31'), null)).toBe(WEEKLY)
  })

  it('still names a rule that has an ending', () => {
    // Otherwise a rule with an ending loses the picker's wording and reads as "Every week".
    expect(repeatLabel(withUntil('FREQ=WEEKLY;BYDAY=TU', '2026-12-31'), TUESDAY, TODAY)).toBe(
      'Weekly on Tuesday, until Dec 31',
    )
    expect(repeatLabel(withUntil('FREQ=DAILY', '2027-03-01'), TUESDAY, TODAY)).toBe(
      'Daily, until Mar 1, 2027',
    )
  })

  // The year is judged against the day handed in, not the process clock, so these hold every year.
  it('drops the year of an ending in the given year and keeps any other', () => {
    const rule = withUntil('FREQ=WEEKLY;BYDAY=TU', '2026-12-31')
    expect(repeatLabel(rule, TUESDAY, '2026-10-10')).toBe('Weekly on Tuesday, until Dec 31')
    expect(repeatLabel(rule, TUESDAY, '2027-01-04')).toBe('Weekly on Tuesday, until Dec 31, 2026')
    expect(repeatLabel(rule, TUESDAY, '2025-12-30')).toBe('Weekly on Tuesday, until Dec 31, 2026')
  })
})

describe('followStart', () => {
  /** The Thursday after, so a moved rule is named after it. */
  const THURSDAY = '2026-10-22T09:00'

  it('keeps the kind chosen, moved to the new start day', () => {
    expect(followStart('FREQ=WEEKLY;BYDAY=TU', THURSDAY)).toBe('FREQ=WEEKLY;BYDAY=TH')
    expect(followStart('FREQ=WEEKLY;INTERVAL=2;BYDAY=TU', THURSDAY)).toBe(
      'FREQ=WEEKLY;INTERVAL=2;BYDAY=TH',
    )
    expect(followStart('FREQ=MONTHLY;BYMONTHDAY=20', THURSDAY)).toBe('FREQ=MONTHLY;BYMONTHDAY=22')
    expect(repeatLabel(followStart('FREQ=WEEKLY;BYDAY=TU', THURSDAY), THURSDAY, TODAY)).toBe(
      'Weekly on Thursday',
    )
  })

  it('leaves alone what does not hang on the start day', () => {
    expect(followStart(null, THURSDAY)).toBeNull()
    expect(followStart('FREQ=DAILY', THURSDAY)).toBe('FREQ=DAILY')
    expect(followStart('FREQ=WEEKLY;BYDAY=TU,TH', THURSDAY)).toBe('FREQ=WEEKLY;BYDAY=TU,TH')
  })
})
