import { describe, expect, it } from 'vitest'
import { deadlineDayLead, dueTodayAt, leadFor, weekDayWord } from './leads'

const TODAY = '2026-10-12' // a Monday
const TZ = 'America/Toronto' // EDT, UTC-4, all of this month

const row = (o: { dueAt?: string; scheduledOn?: string }) => ({
  dueAt: o.dueAt ?? null,
  scheduledOn: o.scheduledOn ?? null,
})

describe('the margin', () => {
  it('names an overdue deadline by its day, flagged and in the missed tone', () => {
    expect(leadFor(row({ dueAt: '2026-10-08T13:00:00.000Z' }), TODAY, TZ)).toMatchObject({
      text: 'Oct 8',
      tone: 'missed',
      flag: true,
    })
  })

  it('gives a deadline today its time', () => {
    expect(leadFor(row({ dueAt: '2026-10-12T20:00:00.000Z' }), TODAY, TZ)).toMatchObject({
      text: '16:00',
      tone: 'deadline',
      flag: true,
    })
  })

  it('says a deadline at the end of today as Today, not as a minute before midnight', () => {
    expect(leadFor(row({ dueAt: '2026-10-13T03:59:00.000Z' }), TODAY, TZ)?.text).toBe('Today')
  })

  it('names a plan for tomorrow by its weekday, unflagged -- "Tomorrow" is wider than the margin', () => {
    expect(leadFor(row({ scheduledOn: '2026-10-13' }), TODAY, TZ)).toMatchObject({
      text: 'Tue',
      tone: 'plan',
      flag: false,
    })
  })

  it('says nothing for a row with no date', () => {
    expect(leadFor(row({}), TODAY, TZ)).toBeNull()
  })

  it('shows the deadline when a row has a plan and a deadline both', () => {
    const lead = leadFor(row({ scheduledOn: TODAY, dueAt: '2026-10-15T21:00:00.000Z' }), TODAY, TZ)
    expect(lead).toMatchObject({ tone: 'deadline', flag: true, text: 'Thu' })
  })

  it('names a day in the week ahead by its weekday, and one beyond it by its date', () => {
    expect(leadFor(row({ scheduledOn: '2026-10-18' }), TODAY, TZ)?.text).toBe('Sun')
    expect(leadFor(row({ scheduledOn: '2026-10-19' }), TODAY, TZ)?.text).toBe('Oct 19')
    // The year is the exact moment's to say; the margin stays one short line.
    expect(leadFor(row({ scheduledOn: '2027-01-05' }), TODAY, TZ)?.text).toBe('Jan 5')
  })

  it('reads the deadline in the account zone, not the machine one', () => {
    // 02:00 UTC on the 13th is still the 12th, 22:00, in Toronto: due today, not tomorrow.
    expect(leadFor(row({ dueAt: '2026-10-13T02:00:00.000Z' }), TODAY, TZ)?.text).toBe('22:00')
  })

  it('carries the exact moment, year included, for the title', () => {
    expect(leadFor(row({ dueAt: '2027-01-05T14:30:00.000Z' }), TODAY, TZ)?.exact).toBe(
      'Due Jan 5, 2027, 09:30',
    )
  })
})

describe('a deadline day', () => {
  it('says today as Today', () => {
    expect(deadlineDayLead(TODAY, TODAY)).toMatchObject({
      text: 'Today',
      tone: 'deadline',
      flag: true,
    })
  })
  it('names a day in the week ahead by its weekday, and one beyond it by its date', () => {
    expect(deadlineDayLead('2026-10-15', TODAY).text).toBe('Thu')
    expect(deadlineDayLead('2026-10-20', TODAY).text).toBe('Oct 20')
  })
  it('carries the whole date, year included, for the title', () => {
    expect(deadlineDayLead('2026-10-15', TODAY).exact).toBe('Next due Oct 15, 2026')
  })
})

describe('a day in the week under review', () => {
  it('says today as Today', () => {
    expect(weekDayWord(TODAY, TODAY, '2026-10-12')).toBe('Today')
  })
  it('names every day of the week by its weekday, the first included', () => {
    // Reviewing the week of Oct 5 on Monday Oct 12: its Monday is a weekday, not "Oct 5".
    expect(weekDayWord('2026-10-05', TODAY, '2026-10-05')).toBe('Mon')
    expect(weekDayWord('2026-10-11', TODAY, '2026-10-05')).toBe('Sun')
  })
  it('names a day before the week by its date', () => {
    expect(weekDayWord('2026-10-04', TODAY, '2026-10-05')).toBe('Oct 4')
  })
})

describe('dueTodayAt', () => {
  it('gives the clock of a deadline today, and nothing by the end of today or on other days', () => {
    expect(dueTodayAt('2026-10-12T20:00:00.000Z', TODAY, TZ)).toBe('16:00')
    expect(dueTodayAt('2026-10-13T03:59:00.000Z', TODAY, TZ)).toBeNull()
    expect(dueTodayAt('2026-10-13T20:00:00.000Z', TODAY, TZ)).toBeNull()
    expect(dueTodayAt(null, TODAY, TZ)).toBeNull()
  })
})
