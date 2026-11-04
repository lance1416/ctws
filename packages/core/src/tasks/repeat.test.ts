import { readTaskRule, type Repeat } from '@ctws/contracts'
import { describe, expect, it } from 'vitest'
import { firstRepeatDay, nextRepeatDay } from './repeat'

const rule = (r: string): Repeat => ({ kind: 'rule', rule: r })

describe('nextRepeatDay, by the calendar', () => {
  it('pays the rent on the 1st of the next month', () => {
    const next = nextRepeatDay(rule('FREQ=MONTHLY;BYMONTHDAY=1'), {
      anchor: '2026-11-01',
      today: '2026-11-01',
      doneOn: '2026-11-01',
    })
    expect(next).toBe('2026-12-01')
  })

  it('skips the weeks a report was missed: next Monday from today, not the one after the last', () => {
    // Planned Monday Oct 19, done on Wednesday Nov 4: Oct 26 and Nov 2 are not made up.
    const next = nextRepeatDay(rule('FREQ=WEEKLY;BYDAY=MO'), {
      anchor: '2026-10-19',
      today: '2026-11-04',
      doneOn: '2026-11-04',
    })
    expect(next).toBe('2026-11-09')
  })

  it('counts every other week from the week it is on', () => {
    const at = { anchor: '2026-11-03', today: '2026-11-03', doneOn: '2026-11-03' }
    expect(nextRepeatDay(rule('FREQ=WEEKLY;INTERVAL=2;BYDAY=TU'), at)).toBe('2026-11-17')
    // No day named: the day of the week it is on.
    expect(nextRepeatDay(rule('FREQ=WEEKLY;INTERVAL=2'), at)).toBe('2026-11-17')
  })

  it('takes several days of the week in order', () => {
    const r = rule('FREQ=WEEKLY;BYDAY=MO,TH')
    const at = { anchor: '2026-11-02', today: '2026-11-02', doneOn: '2026-11-02' }
    expect(nextRepeatDay(r, at)).toBe('2026-11-05')
    expect(nextRepeatDay(r, { ...at, anchor: '2026-11-05' })).toBe('2026-11-09')
  })

  it('goes daily, and every 3 days', () => {
    const at = { anchor: '2026-11-04', today: '2026-11-04', doneOn: '2026-11-04' }
    expect(nextRepeatDay(rule('FREQ=DAILY'), at)).toBe('2026-11-05')
    expect(nextRepeatDay(rule('FREQ=DAILY;INTERVAL=3'), at)).toBe('2026-11-07')
  })

  it('skips a month without the day, as RFC 5545 does, and finds the last day for -1', () => {
    const at = { anchor: '2026-01-31', today: '2026-01-31', doneOn: '2026-01-31' }
    expect(nextRepeatDay(rule('FREQ=MONTHLY;BYMONTHDAY=31'), at)).toBe('2026-03-31')
    expect(nextRepeatDay(rule('FREQ=MONTHLY;BYMONTHDAY=-1'), at)).toBe('2026-02-28')
  })

  it('comes round yearly, on the day named or the day it is on', () => {
    const at = { anchor: '2026-11-09', today: '2026-11-09', doneOn: '2026-11-09' }
    expect(nextRepeatDay(rule('FREQ=YEARLY;BYMONTH=11;BYMONTHDAY=9'), at)).toBe('2027-11-09')
    expect(nextRepeatDay(rule('FREQ=YEARLY'), at)).toBe('2027-11-09')
    const leap = { anchor: '2028-02-29', today: '2028-02-29', doneOn: '2028-02-29' }
    expect(nextRepeatDay(rule('FREQ=YEARLY'), leap)).toBe('2032-02-29')
  })

  it('stops at its end day', () => {
    const r = rule('FREQ=WEEKLY;BYDAY=MO;UNTIL=20261115')
    const at = { anchor: '2026-11-09', today: '2026-11-09', doneOn: '2026-11-09' }
    expect(nextRepeatDay(r, at)).toBeNull()
    expect(nextRepeatDay(r, { ...at, anchor: '2026-11-02', today: '2026-11-02' })).toBe(
      '2026-11-09',
    )
  })

  it('counts from the anchor, not from the day it was done, when that is still ahead', () => {
    // Done early, on Nov 1, for Nov 10: the next is Dec 10, not a month after Nov 1.
    const next = nextRepeatDay(rule('FREQ=MONTHLY;BYMONTHDAY=10'), {
      anchor: '2026-11-10',
      today: '2026-11-01',
      doneOn: '2026-11-01',
    })
    expect(next).toBe('2026-12-10')
  })
})

describe('nextRepeatDay, after done', () => {
  const water: Repeat = { kind: 'after', every: 3, unit: 'day' }

  it('waters the flowers three days after they were last watered', () => {
    expect(
      nextRepeatDay(water, { anchor: '2026-11-04', today: '2026-11-04', doneOn: '2026-11-04' }),
    ).toBe('2026-11-07')
    expect(
      nextRepeatDay(water, { anchor: '2026-11-07', today: '2026-11-09', doneOn: '2026-11-09' }),
    ).toBe('2026-11-12')
  })

  it('counts weeks and months, keeping to the end of a shorter month', () => {
    const at = { anchor: '2026-01-31', today: '2026-01-31', doneOn: '2026-01-31' }
    expect(nextRepeatDay({ kind: 'after', every: 2, unit: 'week' }, at)).toBe('2026-02-14')
    expect(nextRepeatDay({ kind: 'after', every: 1, unit: 'month' }, at)).toBe('2026-02-28')
  })
})

describe('firstRepeatDay', () => {
  it('is the first day the rule lands on from today, today included', () => {
    // Wednesday Nov 4.
    expect(firstRepeatDay(rule('FREQ=MONTHLY;BYMONTHDAY=1'), '2026-11-04')).toBe('2026-12-01')
    expect(firstRepeatDay(rule('FREQ=WEEKLY;BYDAY=WE'), '2026-11-04')).toBe('2026-11-04')
    expect(firstRepeatDay(rule('FREQ=WEEKLY;BYDAY=MO'), '2026-11-04')).toBe('2026-11-09')
    expect(firstRepeatDay({ kind: 'after', every: 3, unit: 'day' }, '2026-11-04')).toBe(
      '2026-11-04',
    )
  })
})

describe('readTaskRule', () => {
  it('reads the subset a task takes', () => {
    expect(readTaskRule('FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,MO;UNTIL=20270101')).toEqual({
      freq: 'WEEKLY',
      interval: 2,
      byDay: [1, 2],
      byMonthDay: null,
      byMonth: null,
      until: '2027-01-01',
    })
  })

  it.each([
    ['FREQ=HOURLY', /FREQ/],
    ['FREQ=DAILY;BYHOUR=9', /BYHOUR/],
    ['FREQ=DAILY;COUNT=3', /COUNT/],
    ['FREQ=MONTHLY;BYDAY=MO', /weekly/],
    ['FREQ=WEEKLY;BYDAY=XX', /MO to SU/],
    ['FREQ=MONTHLY;BYMONTHDAY=32', /1 to 31/],
    ['FREQ=WEEKLY;UNTIL=20270101T000000Z', /date/],
    ['FREQ=DAILY;INTERVAL=0', /INTERVAL/],
  ])('refuses %s, saying why', (r, why) => {
    expect(readTaskRule(r)).toMatch(why)
  })
})
