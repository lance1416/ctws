// @vitest-environment node
import type { TaskStatus } from '@ctws/contracts'
import { beforeAll, describe, expect, it } from 'vitest'

// Fixed non-UTC zone (+05:30, no DST), so the tests prove something on a UTC CI host too. The
// modules are imported once here, after the zone is set, so no test pays for the cold import.
beforeAll(async () => {
  process.env.TZ = 'Asia/Kolkata'
  await load()
})

const load = async () => ({
  ...(await import('../../../platform/time/dates')),
  ...(await import('./dueDates')),
})
const TZ = 'Asia/Kolkata'

// 2026-10-03 (a Saturday), 12:00 local.
const NOW = () => new Date(2026, 9, 3, 12, 0)

describe('overdue label', () => {
  it('counts calendar days in the account zone, not elapsed milliseconds', async () => {
    const { overdueLabel } = await load()
    // Due 23:30 on the 3rd (+05:30); it is 00:10 on the 4th. Forty minutes, but already a day late.
    expect(overdueLabel('2026-10-03T18:00:00.000Z', TZ, new Date('2026-10-03T18:40:00.000Z'))).toBe(
      '1 day late',
    )
    expect(overdueLabel('2026-10-01T03:30:00.000Z', TZ, new Date('2026-10-04T10:00:00.000Z'))).toBe(
      '3 days late',
    )
    // 24h40m after a 23:30 deadline is two calendar days; dividing by a day's milliseconds says one.
    expect(overdueLabel('2026-10-03T18:00:00.000Z', TZ, new Date('2026-10-04T18:40:00.000Z'))).toBe(
      '2 days late',
    )
  })

  it('counts across a month boundary', async () => {
    const { overdueLabel } = await load()
    expect(overdueLabel('2026-09-30T12:00:00.000Z', TZ, new Date('2026-10-02T12:00:00.000Z'))).toBe(
      '2 days late',
    )
  })
})

describe('lateNote', () => {
  const task = (over: Partial<{ status: TaskStatus; dueAt: string }>) => ({
    status: 'todo' as TaskStatus,
    dueAt: null,
    ...over,
  })

  it('says nothing for a dateless task, nor for finished ones however late', async () => {
    const { lateNote } = await load()
    expect(lateNote(task({}), TZ, NOW())).toBeNull()
    const old = '2026-09-01T00:00:00.000Z'
    for (const status of ['done', 'cancelled'] as const)
      expect(lateNote(task({ status, dueAt: old }), TZ, NOW())).toBeNull()
  })

  it('an overdue deadline says how late it is, in calendar days', async () => {
    const { lateNote } = await load()
    // 2026-10-01 09:00 local is two calendar days before the 3rd.
    expect(lateNote(task({ dueAt: new Date(2026, 9, 1, 9, 0).toISOString() }), TZ, NOW())).toBe(
      '2 days late',
    )
  })

  it('a deadline earlier today is not late (the server only tests the day boundary)', async () => {
    const { lateNote } = await load()
    expect(
      lateNote(task({ dueAt: new Date(2026, 9, 3, 8, 0).toISOString() }), TZ, NOW()),
    ).toBeNull()
    expect(
      lateNote(task({ dueAt: new Date(2026, 9, 8, 9, 0).toISOString() }), TZ, NOW()),
    ).toBeNull()
  })
})

describe('instantPhrase', () => {
  it('a deadline a minute before midnight still says 23:59, not the next day', async () => {
    const { instantPhrase } = await load()
    // A clock printed from a UTC getter in +05:30 would read 18:29 here, and a rounded one 00:00
    // of the 9th.
    expect(instantPhrase(new Date(2026, 9, 8, 23, 59).toISOString(), '2026-10-03', TZ)).toBe(
      'Oct 8, 23:59',
    )
  })
})

describe('moveDueToDay', () => {
  it('moves the day and keeps the local time of day, across a month end', async () => {
    const { moveDueToDay } = await load()
    const due = new Date(2026, 9, 1, 9, 45, 30).toISOString() // Oct 1st, 09:45:30 local
    const moved = new Date(moveDueToDay(due, '2026-11-02', TZ))
    expect([moved.getFullYear(), moved.getMonth(), moved.getDate()]).toEqual([2026, 10, 2])
    expect([moved.getHours(), moved.getMinutes(), moved.getSeconds()]).toEqual([9, 45, 30])
  })

  it('keeps a late-evening time on the chosen LOCAL day (not the UTC day)', async () => {
    const { moveDueToDay } = await load()
    // 00:15 local in +05:30 is 18:45 UTC of the day before, where a UTC-based implementation
    // goes wrong.
    const due = new Date(2026, 9, 1, 0, 15).toISOString()
    const moved = new Date(moveDueToDay(due, '2026-10-05', TZ))
    expect([moved.getDate(), moved.getHours(), moved.getMinutes()]).toEqual([5, 0, 15])
  })
})

/**
 * The account's today is the only today. The browser is in Kolkata and the account in New York,
 * which disagree about the day at the instant below.
 */
describe('the account timezone decides, even when the browser is in another one', () => {
  const ACCOUNT = 'America/New_York'
  // 02:00 UTC on the 5th: 07:30 on the 5th in Kolkata, but still 22:00 on the 4th in New York.
  const NOW_CROSS = new Date('2026-10-05T02:00:00.000Z')
  // 00:30 on the 4th in New York -- today, there. In Kolkata it is 10:00 on the 4th, which the
  // browser's own calendar (now the 5th) calls yesterday.
  const DUE = '2026-10-04T04:30:00.000Z'

  /** The server's rule, written apart from the code under test: both days in the account zone. */
  const serverDay = (instant: Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: ACCOUNT }).format(instant)
  const serverSaysOverdue = (dueIso: string, now: Date) =>
    serverDay(new Date(dueIso)) < serverDay(now)

  it('the browser and the account really are on different days at this instant', () => {
    // Guards the fixture: if these stopped differing, the cases below would prove nothing.
    expect(new Intl.DateTimeFormat('en-CA').format(NOW_CROSS)).toBe('2026-10-05')
    expect(serverDay(NOW_CROSS)).toBe('2026-10-04')
  })

  it('the row wording and the server segment agree', async () => {
    const { instantPhrase, lateNote, ymd } = await load()
    expect(serverSaysOverdue(DUE, NOW_CROSS)).toBe(false)
    // Not late, because the server does not think so either.
    expect(lateNote({ status: 'todo', dueAt: DUE }, ACCOUNT, NOW_CROSS)).toBeNull()
    // And the words are New York's day and New York's clock, not Kolkata's.
    expect(instantPhrase(DUE, ymd(NOW_CROSS, ACCOUNT), ACCOUNT)).toBe('Today, 00:30')
  })

  it('when the account really is late, both say so, with the account day count', async () => {
    const { instantPhrase, lateNote, ymd } = await load()
    // 23:00 on the 1st in New York: three calendar days before the 4th, there.
    const late = '2026-10-02T03:00:00.000Z'
    expect(serverSaysOverdue(late, NOW_CROSS)).toBe(true)
    expect(lateNote({ status: 'todo', dueAt: late }, ACCOUNT, NOW_CROSS)).toBe('3 days late')
    expect(instantPhrase(late, ymd(NOW_CROSS, ACCOUNT), ACCOUNT)).toBe('Oct 1, 23:00')
  })

  it('a deadline moved to a day lands on that day in the account calendar', async () => {
    const { moveDueToDay } = await load()
    const moved = moveDueToDay(DUE, '2026-10-09', ACCOUNT)
    expect(serverDay(new Date(moved))).toBe('2026-10-09')
    // The wall clock it was given is kept, in that zone.
    const clock = new Intl.DateTimeFormat('en-GB', {
      timeZone: ACCOUNT,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    expect(clock.format(new Date(moved))).toBe('00:30')
    // 22:00 on the 3rd in New York is 07:30 on the 4th in Kolkata; setting the date on the
    // browser's calendar would land this on the 8th in New York.
    const crossMoved = moveDueToDay('2026-10-04T02:00:00.000Z', '2026-10-09', ACCOUNT)
    expect(serverDay(new Date(crossMoved))).toBe('2026-10-09')
    expect(clock.format(new Date(crossMoved))).toBe('22:00')
  })
})

// Across a DST boundary a local day is 23 or 25 hours long: elapsed time is not calendar days.
describe('deadlines across a DST boundary', () => {
  const NY = 'America/New_York'

  it('counts calendar days over the 23-hour and the 25-hour day alike', async () => {
    const { overdueLabel } = await load()
    // Spring forward: 2026-03-08 is 23 hours long in New York. Due 20:00 on the 7th, now 10:00 on
    // the 9th -- 47 wall-clock hours, and two calendar days.
    expect(overdueLabel('2026-03-08T01:00:00.000Z', NY, new Date('2026-03-09T14:00:00.000Z'))).toBe(
      '2 days late',
    )
    // Fall back: 2026-11-01 is 25 hours long. Due 20:00 on October 31st, now 10:00 on November 2nd
    // -- 49 hours, and still two calendar days.
    expect(overdueLabel('2026-11-01T00:00:00.000Z', NY, new Date('2026-11-02T15:00:00.000Z'))).toBe(
      '2 days late',
    )
    // And a deadline one hour after the spring-forward jump, read from the following day, is one.
    expect(overdueLabel('2026-03-08T07:30:00.000Z', NY, new Date('2026-03-09T14:00:00.000Z'))).toBe(
      '1 day late',
    )
    // Due 23:30 on the 7th, read at 00:30 on the 9th: two calendar days but exactly 24 elapsed
    // hours, since the short day ate one. Subtracting milliseconds says one day.
    expect(overdueLabel('2026-03-08T04:30:00.000Z', NY, new Date('2026-03-09T04:30:00.000Z'))).toBe(
      '2 days late',
    )
  })

  it('prints the wall clock on either side of the jump, not a shifted one', async () => {
    const { instantPhrase } = await load()
    // 06:30 UTC on the 8th is 01:30 EST (before the jump); 07:30 UTC is 03:30 EDT (after it).
    expect(instantPhrase('2026-03-08T06:30:00.000Z', '2026-03-10', NY)).toBe('Mar 8, 01:30')
    expect(instantPhrase('2026-03-08T07:30:00.000Z', '2026-03-10', NY)).toBe('Mar 8, 03:30')
  })

  it('moving a deadline keeps its wall clock across the jump, not its offset', async () => {
    const { moveDueToDay } = await load()
    // 09:00 on March 6th is EST (-05:00) = 14:00 UTC; on March 9th the same 09:00 is EDT (-04:00)
    // = 13:00 UTC. Keeping the instant's offset would have moved the clock by an hour.
    expect(moveDueToDay('2026-03-06T14:00:00.000Z', '2026-03-09', NY)).toBe(
      '2026-03-09T13:00:00.000Z',
    )
  })
})
