// @vitest-environment node
import type { TaskStatus } from '@ctws/contracts'
import { beforeAll, describe, expect, it } from 'vitest'

// Fixed zone with a half-hour offset and no DST, so a UTC-assuming implementation fails here.
beforeAll(() => {
  process.env.TZ = 'Asia/Kolkata'
})

const load = async () => ({
  ...(await import('../../platform/time/dates')),
  ...(await import('./dueDates')),
})
const loadActions = () => import('./api/taskActions')
const loadControls = () => import('./components/StatusControls')

// 2026-10-03 (a Saturday), 12:00 local.
const NOW = () => new Date(2026, 9, 3, 12, 0)

/**
 * THE ACCOUNT'S ZONE -- which these tests pass EXPLICITLY, because the account's is the only zone
 * the date helpers know. Here it is the same as the process `TZ`, so the literals above read as
 * they always did; the block at the bottom of this file is the one that pulls the two apart, and
 * it is the one that would have failed before this change.
 */
const TZ = 'Asia/Kolkata'

describe('calendar arithmetic', () => {
  it('adds days across a month end', async () => {
    const { addDays } = await load()
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('next Monday is always strictly later, from any weekday', async () => {
    const { nextMonday } = await load()
    expect(nextMonday('2026-10-03')).toBe('2026-10-05') // Saturday -> Monday
    expect(nextMonday('2026-10-04')).toBe('2026-10-05') // Sunday -> Monday
    expect(nextMonday('2026-10-05')).toBe('2026-10-12') // Monday -> a week on, not itself
    expect(nextMonday('2026-10-07')).toBe('2026-10-12') // Wednesday
  })

  it('says today / tomorrow / yesterday, else the date', async () => {
    const { dayPhrase } = await load()
    expect(dayPhrase('2026-10-03', '2026-10-03')).toBe('Today')
    expect(dayPhrase('2026-10-04', '2026-10-03')).toBe('Tomorrow')
    expect(dayPhrase('2026-10-02', '2026-10-03')).toBe('Yesterday')
    expect(dayPhrase('2026-10-08', '2026-10-03')).toBe('Oct 8')
    expect(dayPhrase('2027-01-02', '2026-10-03')).toBe('Jan 2, 2027')
  })
})

describe('dateHints', () => {
  const task = (over: Partial<{ status: TaskStatus; dueAt: string; scheduledOn: string }>) => ({
    status: 'todo' as TaskStatus,
    dueAt: null,
    scheduledOn: null,
    ...over,
  })

  it('shows nothing for a dateless task and for finished ones, however overdue', async () => {
    const { dateHints } = await load()
    expect(dateHints(task({}), TZ, NOW())).toEqual({ scheduled: null, due: null })
    const old = '2026-09-01T00:00:00.000Z'
    for (const status of ['done', 'cancelled'] as const)
      expect(dateHints(task({ status, dueAt: old, scheduledOn: '2026-10-04' }), TZ, NOW())).toEqual(
        {
          scheduled: null,
          due: null,
        },
      )
  })

  it('an overdue deadline says WHICH one it was, to the minute, and how late it is', async () => {
    const { dateHints } = await load()
    // 2026-10-01 09:00 local is two calendar days before the 3rd.
    const due = new Date(2026, 9, 1, 9, 0).toISOString()
    // BOTH HALVES. "2 days late" alone is what fits an 8rem cell; the words are on a line of
    // their own, and the lateness on its own cannot answer "due when?" -- which is the
    // compression the user rejected.
    expect(dateHints(task({ dueAt: due }), TZ, NOW()).due).toEqual({
      text: 'Due Oct 1, 09:00',
      late: '2 days late',
      overdue: true,
    })
  })

  it('a deadline earlier today is not overdue (the server cascade only tests the day boundary)', async () => {
    const { dateHints } = await load()
    const due = new Date(2026, 9, 3, 8, 0).toISOString()
    expect(dateHints(task({ dueAt: due }), TZ, NOW()).due).toEqual({
      text: 'Due today, 08:00',
      late: null,
      overdue: false,
    })
  })

  it('a future deadline keeps its clock too, and a scheduled day gets its own phrase', async () => {
    const { dateHints } = await load()
    const due = new Date(2026, 9, 8, 9, 0).toISOString()
    expect(dateHints(task({ dueAt: due, scheduledOn: '2026-10-04' }), TZ, NOW())).toEqual({
      scheduled: 'Planned for tomorrow',
      // A day with no time ("Due Oct 8") is not complete to the minute, and the row says the
      // minute.
      due: { text: 'Due Oct 8, 09:00', late: null, overdue: false },
    })
  })

  it('a deadline a minute before midnight still says 23:59, not the next day', async () => {
    const { dateHints } = await load()
    // A clock printed from a UTC getter in +05:30 would read 18:29 here, and a rounded one 00:00
    // of the 9th. The minute is the thing being pinned, so it is pinned at the hardest minute
    // there is.
    const due = new Date(2026, 9, 8, 23, 59).toISOString()
    expect(dateHints(task({ dueAt: due }), TZ, NOW()).due!.text).toBe('Due Oct 8, 23:59')
  })

  it('an overdue task that has been rescheduled shows both', async () => {
    const { dateHints } = await load()
    const due = new Date(2026, 9, 1, 9, 0).toISOString()
    expect(dateHints(task({ dueAt: due, scheduledOn: '2026-10-04' }), TZ, NOW())).toEqual({
      scheduled: 'Planned for tomorrow',
      due: { text: 'Due Oct 1, 09:00', late: '2 days late', overdue: true },
    })
  })
})

describe('status targets', () => {
  it('finishing and restoring', async () => {
    const { toggleDoneTarget } = await loadActions()
    expect(toggleDoneTarget('todo')).toBe('done')
    expect(toggleDoneTarget('backlog')).toBe('done')
    expect(toggleDoneTarget('in_progress')).toBe('done')
    // Restoring cannot know the previous status: backlog is the deliberate simplification.
    expect(toggleDoneTarget('done')).toBe('backlog')
    expect(toggleDoneTarget('cancelled')).toBe('backlog')
  })

  it('starting and stopping', async () => {
    const { toggleStartTarget } = await loadActions()
    expect(toggleStartTarget('todo')).toBe('in_progress')
    expect(toggleStartTarget('done')).toBe('in_progress')
    expect(toggleStartTarget('in_progress')).toBe('todo')
  })

  it('the keys x and s map to them, and any modifier means it is not ours', async () => {
    const { statusForKey } = await loadControls()
    const k = (key: string, mods: object = {}) => ({
      key,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      ...mods,
    })
    expect(statusForKey(k('x'), 'todo')).toBe('done')
    expect(statusForKey(k('x'), 'done')).toBe('backlog')
    expect(statusForKey(k('s'), 'todo')).toBe('in_progress')
    expect(statusForKey(k('q'), 'todo')).toBeNull()
    for (const m of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey'])
      expect(statusForKey(k('x', { [m]: true }), 'todo')).toBeNull()
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
    // 23:30 local in +05:30 is 18:00 UTC: the same calendar day either way, but 00:15 local is
    // 18:45 UTC of the day BEFORE, which is where a UTC-based implementation goes wrong.
    const due = new Date(2026, 9, 1, 0, 15).toISOString()
    const moved = new Date(moveDueToDay(due, '2026-10-05', TZ))
    expect([moved.getDate(), moved.getHours(), moved.getMinutes()]).toEqual([5, 0, 15])
  })
})

/**
 * THE ACCOUNT'S TODAY IS THE ONLY TODAY -- the guard the whole timezone change exists for.
 *
 * The process `TZ` here is Asia/Kolkata (+05:30) and the ACCOUNT is in New York (-04:00 in
 * October). Every other test in this repo, unit and e2e alike, keeps the two equal: the e2e
 * registers its users with `browserTimezone()`, and the unit tests only ever had one zone. So
 * nothing could catch the defect these cases are about, which is why they fix the two to DIFFERENT
 * zones on purpose.
 *
 * What it would have caught: the previous `dateHints` read the day off `getFullYear()/getMonth()/
 * getDate()`, i.e. the BROWSER's zone, and took no timezone argument at all -- `TaskRow` had none
 * to pass. At the instant below the browser's calendar has already turned over and New York's has
 * not, so reading it in the browser's zone calls this deadline yesterday's, one day late, while the server --
 * which segments with `at time zone 'America/New_York'` -- had it as today's and not overdue. The
 * row and the heading it sat under contradicted each other.
 */
describe('the account timezone decides, even when the browser is in another one', () => {
  const ACCOUNT = 'America/New_York'
  // 02:00 UTC on the 5th: 07:30 on the 5th in Kolkata, but still 22:00 on the FOURTH in New York.
  const NOW_CROSS = new Date('2026-10-05T02:00:00.000Z')
  // 00:30 on the 4th in New York -- today, there. In Kolkata it is 10:00 on the 4th, which the
  // browser's own calendar (now the 5th) calls yesterday.
  const DUE = '2026-10-04T04:30:00.000Z'

  /**
   * The SERVER's rule, written out independently of the code under test: `date_trunc('day', clock
   * at time zone $tz)` compared against the deadline in the same zone. `en-CA` is the formatter the
   * three pages that needed a calendar day already used, so this is the API's answer rather than a
   * second copy of `dueAt.ts`.
   */
  const serverDay = (instant: Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: ACCOUNT }).format(instant)
  const serverSaysOverdue = (dueIso: string, now: Date) =>
    serverDay(new Date(dueIso)) < serverDay(now)

  it('the browser and the account really are on different days at this instant', () => {
    // Guards the fixture itself: if these ever stopped differing, the cases below would pass for
    // the wrong reason and prove nothing.
    expect(new Intl.DateTimeFormat('en-CA').format(NOW_CROSS)).toBe('2026-10-05')
    expect(serverDay(NOW_CROSS)).toBe('2026-10-04')
  })

  it('the row wording and the server segment agree', async () => {
    const { dateHints } = await load()
    expect(serverSaysOverdue(DUE, NOW_CROSS)).toBe(false)
    const hints = dateHints({ status: 'todo', dueAt: DUE, scheduledOn: null }, ACCOUNT, NOW_CROSS)
    // Not overdue, because the server does not think so either -- and this is the assertion the
    // old browser-zone implementation failed: it answered `true`.
    expect(hints.due!.overdue).toBe(serverSaysOverdue(DUE, NOW_CROSS))
    // And the words are New York's day and New York's clock, not Kolkata's.
    expect(hints.due).toEqual({ text: 'Due today, 00:30', late: null, overdue: false })
  })

  it('when the account really is late, both say so, with the account day count', async () => {
    const { dateHints } = await load()
    // 23:00 on the 1st in New York: three calendar days before the 4th, there.
    const late = '2026-10-02T03:00:00.000Z'
    expect(serverSaysOverdue(late, NOW_CROSS)).toBe(true)
    const hints = dateHints({ status: 'todo', dueAt: late, scheduledOn: null }, ACCOUNT, NOW_CROSS)
    expect(hints.due).toEqual({ text: 'Due Oct 1, 23:00', late: '3 days late', overdue: true })
  })

  it('today, tomorrow and next Monday are the account days', async () => {
    const { todayIn, addDays, nextMonday } = await load()
    expect(todayIn(ACCOUNT, NOW_CROSS)).toBe('2026-10-04')
    expect(addDays(todayIn(ACCOUNT, NOW_CROSS), 1)).toBe('2026-10-05')
    // The 4th is a Sunday in New York while the browser is already on Monday the 5th: “Next week” from
    // there is the 5th, and from the browser's day it would have been the 12th.
    expect(nextMonday(todayIn(ACCOUNT, NOW_CROSS))).toBe('2026-10-05')
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
    // AND A DEADLINE WHOSE TWO ZONES DISAGREE ABOUT WHICH DAY IT IS ON: 22:00 on the 3rd in New
    // York is already 07:30 on the 4th in Kolkata. Setting the date on the browser's calendar
    // lands this on the 8th in New York, not the 9th. The case above cannot see it: its two
    // zones share a day, so either calendar gives the same answer there.
    const crossMoved = moveDueToDay('2026-10-04T02:00:00.000Z', '2026-10-09', ACCOUNT)
    expect(serverDay(new Date(crossMoved))).toBe('2026-10-09')
    expect(clock.format(new Date(crossMoved))).toBe('22:00')
  })

  it('the end of the day is the end of the account day', async () => {
    const { dayEndIso } = await load()
    // 23:59 on the 4th in New York (EDT, -04:00) is 03:59 UTC on the 5th; the browser's zone would
    // have made it 18:29 UTC on the 4th, a different instant and the wrong day there.
    expect(dayEndIso('2026-10-04', ACCOUNT)).toBe('2026-10-05T03:59:00.000Z')
  })
})

/**
 * ACROSS A DST BOUNDARY, where a local day is 23 or 25 hours long and elapsed time stops being
 * the same question as calendar days. The arithmetic is a library's, so what is pinned here is
 * the ANSWER, on both sides of both transitions, in a zone that actually has them.
 */
describe('date helpers across a DST boundary', () => {
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
    // THE DST CASE THAT ONLY CALENDAR COUNTING GETS RIGHT. Due 23:30 on the 7th, read at 00:30 on
    // the 9th: two calendar days, across the 23-hour day -- and EXACTLY 24 elapsed hours, because
    // the short day ate one. Subtracting milliseconds says one day however it rounds, so this is
    // the case that separates calendar counting from elapsed time.
    expect(overdueLabel('2026-03-08T04:30:00.000Z', NY, new Date('2026-03-09T04:30:00.000Z'))).toBe(
      '2 days late',
    )
  })

  it('day-string arithmetic steps over the short and the long day', async () => {
    const { addDays, nextMonday } = await load()
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08')
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09')
    expect(addDays('2026-03-09', -1)).toBe('2026-03-08')
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02')
    // 2026-03-08 is a Sunday; the Monday after it is the 9th, short day or not.
    expect(nextMonday('2026-03-08')).toBe('2026-03-09')
  })

  it('prints the wall clock on either side of the jump, not a shifted one', async () => {
    const { dateHints } = await load()
    const at = new Date('2026-03-10T12:00:00.000Z')
    const hint = (dueIso: string) =>
      dateHints({ status: 'todo', dueAt: dueIso, scheduledOn: null }, NY, at).due!.text
    // 06:30 UTC on the 8th is 01:30 EST (before the jump); 07:30 UTC is 03:30 EDT (after it).
    expect(hint('2026-03-08T06:30:00.000Z')).toBe('Due Mar 8, 01:30')
    expect(hint('2026-03-08T07:30:00.000Z')).toBe('Due Mar 8, 03:30')
  })

  it('moving a deadline keeps its wall clock across the jump, not its offset', async () => {
    const { moveDueToDay } = await load()
    // 09:00 on March 6th is EST (-05:00) = 14:00 UTC; on March 9th the same 09:00 is EDT (-04:00)
    // = 13:00 UTC. Keeping the instant's offset would have moved the clock by an hour.
    expect(moveDueToDay('2026-03-06T14:00:00.000Z', '2026-03-09', NY)).toBe(
      '2026-03-09T13:00:00.000Z',
    )
  })

  it('the end of a short day is still 23:59 there', async () => {
    const { dayEndIso } = await load()
    expect(dayEndIso('2026-03-08', NY)).toBe('2026-03-09T03:59:00.000Z')
    expect(dayEndIso('2026-11-01', NY)).toBe('2026-11-02T04:59:00.000Z')
  })
})
