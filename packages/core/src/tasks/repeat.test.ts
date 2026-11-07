import { readTaskRule, type Repeat } from '@ctws/contracts'
import { describe, expect, it } from 'vitest'
import { firstRepeatDay, handOn, nextRepeatDay } from './repeat'

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

  it('puts the 31st on the last day of a shorter month, and the next month back on its 31st', () => {
    const jan = { anchor: '2026-01-31', today: '2026-01-31', doneOn: '2026-01-31' }
    const feb = { anchor: '2026-02-28', today: '2026-02-28', doneOn: '2026-02-28' }
    expect(nextRepeatDay(rule('FREQ=MONTHLY;BYMONTHDAY=31'), jan)).toBe('2026-02-28')
    expect(nextRepeatDay(rule('FREQ=MONTHLY;BYMONTHDAY=31'), feb)).toBe('2026-03-31')
    expect(nextRepeatDay(rule('FREQ=MONTHLY;BYMONTHDAY=-1'), jan)).toBe('2026-02-28')
  })

  it('does not bring back on the same day what was done today, even a Monday one done on a Monday', () => {
    const at = { anchor: '2026-11-02', today: '2026-11-09', doneOn: '2026-11-09' }
    expect(nextRepeatDay(rule('FREQ=WEEKLY;BYDAY=MO'), at)).toBe('2026-11-16')
  })

  it('comes round yearly, on the day named or the day it is on', () => {
    const at = { anchor: '2026-11-09', today: '2026-11-09', doneOn: '2026-11-09' }
    expect(nextRepeatDay(rule('FREQ=YEARLY;BYMONTH=11;BYMONTHDAY=9'), at)).toBe('2027-11-09')
    expect(nextRepeatDay(rule('FREQ=YEARLY'), at)).toBe('2027-11-09')
    // February 29th is the 28th in a year without one, and the 29th again in the next leap year.
    const leap = { anchor: '2028-02-29', today: '2028-02-29', doneOn: '2028-02-29' }
    expect(nextRepeatDay(rule('FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29'), leap)).toBe('2029-02-28')
    const plain = { anchor: '2027-02-28', today: '2027-02-28', doneOn: '2027-02-28' }
    expect(nextRepeatDay(rule('FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29'), plain)).toBe('2028-02-29')
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

describe('handOn', () => {
  it('pins the day a monthly rule leans on when it is the 29th to the 31st', () => {
    expect(handOn(rule('FREQ=MONTHLY'), '2026-01-31')).toEqual(rule('FREQ=MONTHLY;BYMONTHDAY=31'))
    expect(handOn(rule('FREQ=YEARLY'), '2028-02-29')).toEqual(
      rule('FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29'),
    )
  })

  it('leaves alone a rule with its day, an early day, a weekly rule and a while after done', () => {
    expect(handOn(rule('FREQ=MONTHLY;BYMONTHDAY=31'), '2026-01-31')).toEqual(
      rule('FREQ=MONTHLY;BYMONTHDAY=31'),
    )
    expect(handOn(rule('FREQ=MONTHLY'), '2026-01-15')).toEqual(rule('FREQ=MONTHLY'))
    expect(handOn(rule('FREQ=WEEKLY'), '2026-01-31')).toEqual(rule('FREQ=WEEKLY'))
    const after: Repeat = { kind: 'after', every: 1, unit: 'month' }
    expect(handOn(after, '2026-01-31')).toEqual(after)
  })
})
