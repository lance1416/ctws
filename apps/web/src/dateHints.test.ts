// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'

// Fixed zone with a half-hour offset and no DST, so a UTC-assuming implementation fails here.
beforeAll(() => {
  process.env.TZ = 'Asia/Kolkata'
})

const load = () => import('./dueAt')
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
    expect(dayPhrase('2026-10-03', '2026-10-03')).toBe('今天')
    expect(dayPhrase('2026-10-04', '2026-10-03')).toBe('明天')
    expect(dayPhrase('2026-10-02', '2026-10-03')).toBe('昨天')
    expect(dayPhrase('2026-10-08', '2026-10-03')).toBe('10月8日')
    expect(dayPhrase('2027-01-02', '2026-10-03')).toBe('2027年1月2日')
  })
})

describe('dateHints', () => {
  const task = (over: object) => ({ status: 'todo', dueAt: null, scheduledOn: null, ...over })

  it('shows nothing for a dateless task and for finished ones, however overdue', async () => {
    const { dateHints } = await load()
    expect(dateHints(task({}), TZ, NOW())).toEqual({ scheduled: null, due: null })
    const old = '2026-09-01T00:00:00.000Z'
    for (const status of ['done', 'cancelled'])
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
    // Both halves. The previous edition said only 「已逾 2 天」 because the label had to fit an 8rem
    // cell; the words are on a line of their own now (spec §2), and 「已逾 2 天」 alone cannot
    // answer "due when?" -- which is the compression the user rejected.
    expect(dateHints(task({ dueAt: due }), TZ, NOW()).due).toEqual({
      text: '10月1日 09:00 截止',
      late: '已逾 2 天',
      overdue: true,
    })
  })

  it('a deadline earlier today is not overdue (the server cascade only tests the day boundary)', async () => {
    const { dateHints } = await load()
    const due = new Date(2026, 9, 3, 8, 0).toISOString()
    expect(dateHints(task({ dueAt: due }), TZ, NOW()).due).toEqual({
      text: '今天 08:00 截止',
      late: null,
      overdue: false,
    })
  })

  it('a future deadline keeps its clock too, and a scheduled day gets its own phrase', async () => {
    const { dateHints } = await load()
    const due = new Date(2026, 9, 8, 9, 0).toISOString()
    expect(dateHints(task({ dueAt: due, scheduledOn: '2026-10-04' }), TZ, NOW())).toEqual({
      scheduled: '排到明天',
      // "10月8日截止" was the old cell's wording: a day with no time is not complete to the
      // minute, and §6 asks for the minute.
      due: { text: '10月8日 09:00 截止', late: null, overdue: false },
    })
  })

  it('a deadline a minute before midnight still says 23:59, not the next day', async () => {
    const { dateHints } = await load()
    // A clock printed from a UTC getter in +05:30 would read 18:29 here, and a rounded one 00:00
    // of the 9th. The minute is the thing §6 pins, so it is pinned at the hardest minute there is.
    const due = new Date(2026, 9, 8, 23, 59).toISOString()
    expect(dateHints(task({ dueAt: due }), TZ, NOW()).due!.text).toBe('10月8日 23:59 截止')
  })

  it('an overdue task that has been rescheduled shows both', async () => {
    const { dateHints } = await load()
    const due = new Date(2026, 9, 1, 9, 0).toISOString()
    expect(dateHints(task({ dueAt: due, scheduledOn: '2026-10-04' }), TZ, NOW())).toEqual({
      scheduled: '排到明天',
      due: { text: '10月1日 09:00 截止', late: '已逾 2 天', overdue: true },
    })
  })
})

/**
 * `dateMarks` is what a LIST reserves its date columns from, and `dateHints` is what each row then
 * draws into them. If the two could disagree, a column would be reserved and left empty, or a cell
 * would be drawn with no track under it.
 *
 * The clock is the way they would drift, so the agreement is checked at SEVERAL instants on either
 * side of the wordings' boundaries -- a deadline before today, earlier today, later today and in
 * the future -- while `dateMarks` reads no clock at all. Every instant here is a literal, so this
 * test says the same thing at every hour of every day (the repo has had a test that was red for one
 * hour in twenty-four; it expressed "yesterday" as a fixed 25-hour offset).
 */
describe('dateMarks agrees with dateHints, without reading the clock', () => {
  const INSTANTS = [
    new Date(2026, 9, 3, 0, 1), // just after midnight: yesterday's deadline just became overdue
    new Date(2026, 9, 3, 12, 0),
    new Date(2026, 9, 3, 23, 59),
    new Date(2026, 9, 5, 12, 0), // two days on: "明天" has become "昨天"
  ]
  const DUES = [
    null,
    new Date(2026, 9, 1, 9, 0).toISOString(),
    new Date(2026, 9, 3, 8, 0).toISOString(),
    new Date(2026, 9, 8, 9, 0).toISOString(),
  ]
  const PLANS = [null, '2026-10-02', '2026-10-03', '2026-10-04']

  it('says a cell exists exactly when dateHints fills it, for every status and every instant', async () => {
    const { dateMarks, dateHints } = await load()
    for (const status of ['backlog', 'todo', 'in_progress', 'done', 'cancelled'])
      for (const dueAt of DUES)
        for (const scheduledOn of PLANS) {
          const t = { status, dueAt, scheduledOn }
          const cells = dateMarks(t)
          for (const now of INSTANTS) {
            const hints = dateHints(t, TZ, now)
            const why = `${status} due=${dueAt} plan=${scheduledOn} at ${now.toISOString()}`
            expect(cells.due, why).toBe(hints.due !== null)
            expect(cells.plan, why).toBe(hints.scheduled !== null)
          }
        }
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

describe('carriedLabel', () => {
  it('names the planned day and says it was carried, for any day before today', async () => {
    const { carriedLabel } = await load()
    expect(carriedLabel('2026-09-28', TZ, NOW())).toBe('原定9月28日，已顺延')
    expect(carriedLabel('2026-10-02', TZ, NOW())).toBe('原定昨天，已顺延')
    expect(carriedLabel('2025-12-31', TZ, NOW())).toBe('原定2025年12月31日，已顺延')
  })

  it('stays quiet for a plan on today, later, or none', async () => {
    const { carriedLabel } = await load()
    expect(carriedLabel('2026-10-03', TZ, NOW())).toBeNull()
    expect(carriedLabel('2026-10-04', TZ, NOW())).toBeNull()
    expect(carriedLabel(null, TZ, NOW())).toBeNull()
  })

  it('judges by the local calendar day, not the instant: 00:05 today is still today', async () => {
    const { carriedLabel } = await load()
    const justAfterMidnight = new Date(2026, 9, 3, 0, 5)
    expect(carriedLabel('2026-10-03', TZ, justAfterMidnight)).toBeNull()
    expect(carriedLabel('2026-10-02', TZ, justAfterMidnight)).not.toBeNull()
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
 * not, so the old code called this deadline 「昨天 10:00 截止 · 已逾 1 天」 while the server --
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
    // And the words are New York's day and New York's clock, not Kolkata's 「昨天 10:00」.
    expect(hints.due).toEqual({ text: '今天 00:30 截止', late: null, overdue: false })
  })

  it('when the account really is late, both say so, with the account day count', async () => {
    const { dateHints } = await load()
    // 23:00 on the 1st in New York: three calendar days before the 4th, there.
    const late = '2026-10-02T03:00:00.000Z'
    expect(serverSaysOverdue(late, NOW_CROSS)).toBe(true)
    const hints = dateHints({ status: 'todo', dueAt: late, scheduledOn: null }, ACCOUNT, NOW_CROSS)
    expect(hints.due).toEqual({ text: '10月1日 23:00 截止', late: '已逾 3 天', overdue: true })
  })

  it('a plan is carried by the account calendar, not the browser one', async () => {
    const { carriedLabel } = await load()
    // The 4th is today in New York and yesterday in Kolkata: the plan is not carried.
    expect(carriedLabel('2026-10-04', ACCOUNT, NOW_CROSS)).toBeNull()
    expect(carriedLabel('2026-10-03', ACCOUNT, NOW_CROSS)).toBe('原定昨天，已顺延')
  })

  it('today, tomorrow and next Monday are the account days', async () => {
    const { todayIn, addDays, nextMonday } = await load()
    expect(todayIn(ACCOUNT, NOW_CROSS)).toBe('2026-10-04')
    expect(addDays(todayIn(ACCOUNT, NOW_CROSS), 1)).toBe('2026-10-05')
    // The 4th is a Sunday in New York while the browser is already on Monday the 5th: 「下周」 from
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
  })

  it('the end of the day is the end of the account day', async () => {
    const { dayEndIso } = await load()
    // 23:59 on the 4th in New York (EDT, -04:00) is 03:59 UTC on the 5th; the browser's zone would
    // have made it 18:29 UTC on the 4th, a different instant and the wrong day there.
    expect(dayEndIso('2026-10-04', ACCOUNT)).toBe('2026-10-05T03:59:00.000Z')
  })

  it('the datemarks agreement holds in a zone other than the process one', async () => {
    const { dateMarks, dateHints } = await load()
    for (const status of ['backlog', 'todo', 'in_progress', 'done', 'cancelled'])
      for (const dueAt of [null, DUE, '2026-10-02T03:00:00.000Z'])
        for (const scheduledOn of [null, '2026-10-03', '2026-10-04', '2026-10-05']) {
          const t = { status, dueAt, scheduledOn }
          const cells = dateMarks(t)
          const hints = dateHints(t, ACCOUNT, NOW_CROSS)
          const why = `${status} due=${dueAt} plan=${scheduledOn}`
          expect(cells.due, why).toBe(hints.due !== null)
          expect(cells.plan, why).toBe(hints.scheduled !== null)
        }
  })
})

/**
 * ACROSS A DST BOUNDARY. Two of the comments the old implementation carried existed only because of
 * DST -- "round, not floor: a DST change makes a local day 23 or 25 hours" and "done in UTC so a
 * DST change cannot shift the day". The arithmetic is a library's now, so what is left to pin is
 * the ANSWER, on both sides of both transitions, in a zone that actually has them.
 */
describe('date helpers across a DST boundary', () => {
  const NY = 'America/New_York'

  it('counts calendar days over the 23-hour and the 25-hour day alike', async () => {
    const { overdueLabel } = await load()
    // Spring forward: 2026-03-08 is 23 hours long in New York. Due 20:00 on the 7th, now 10:00 on
    // the 9th -- 47 wall-clock hours, and two calendar days.
    expect(overdueLabel('2026-03-08T01:00:00.000Z', NY, new Date('2026-03-09T14:00:00.000Z'))).toBe(
      '已逾 2 天',
    )
    // Fall back: 2026-11-01 is 25 hours long. Due 20:00 on October 31st, now 10:00 on November 2nd
    // -- 49 hours, and still two calendar days.
    expect(overdueLabel('2026-11-01T00:00:00.000Z', NY, new Date('2026-11-02T15:00:00.000Z'))).toBe(
      '已逾 2 天',
    )
    // And a deadline one hour after the spring-forward jump, read from the following day, is one.
    expect(overdueLabel('2026-03-08T07:30:00.000Z', NY, new Date('2026-03-09T14:00:00.000Z'))).toBe(
      '已逾 1 天',
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
    expect(hint('2026-03-08T06:30:00.000Z')).toBe('3月8日 01:30 截止')
    expect(hint('2026-03-08T07:30:00.000Z')).toBe('3月8日 03:30 截止')
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
