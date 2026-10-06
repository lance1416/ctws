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
    expect(dateHints(task({}), NOW())).toEqual({ scheduled: null, due: null })
    const old = '2026-09-01T00:00:00.000Z'
    for (const status of ['done', 'cancelled'])
      expect(dateHints(task({ status, dueAt: old, scheduledOn: '2026-10-04' }), NOW())).toEqual({
        scheduled: null,
        due: null,
      })
  })

  it('an overdue deadline says WHICH one it was, to the minute, and how late it is', async () => {
    const { dateHints } = await load()
    // 2026-10-01 09:00 local is two calendar days before the 3rd.
    const due = new Date(2026, 9, 1, 9, 0).toISOString()
    // Both halves. The previous edition said only 「已逾 2 天」 because the label had to fit an 8rem
    // cell; the words are on a line of their own now (spec §2), and 「已逾 2 天」 alone cannot
    // answer "due when?" -- which is the compression the user rejected.
    expect(dateHints(task({ dueAt: due }), NOW()).due).toEqual({
      text: '10月1日 09:00 截止',
      late: '已逾 2 天',
      overdue: true,
    })
  })

  it('a deadline earlier today is not overdue (the server cascade only tests the day boundary)', async () => {
    const { dateHints } = await load()
    const due = new Date(2026, 9, 3, 8, 0).toISOString()
    expect(dateHints(task({ dueAt: due }), NOW()).due).toEqual({
      text: '今天 08:00 截止',
      late: null,
      overdue: false,
    })
  })

  it('a future deadline keeps its clock too, and a scheduled day gets its own phrase', async () => {
    const { dateHints } = await load()
    const due = new Date(2026, 9, 8, 9, 0).toISOString()
    expect(dateHints(task({ dueAt: due, scheduledOn: '2026-10-04' }), NOW())).toEqual({
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
    expect(dateHints(task({ dueAt: due }), NOW()).due!.text).toBe('10月8日 23:59 截止')
  })

  it('an overdue task that has been rescheduled shows both', async () => {
    const { dateHints } = await load()
    const due = new Date(2026, 9, 1, 9, 0).toISOString()
    expect(dateHints(task({ dueAt: due, scheduledOn: '2026-10-04' }), NOW())).toEqual({
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
            const hints = dateHints(t, now)
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
    const moved = new Date(moveDueToDay(due, '2026-11-02'))
    expect([moved.getFullYear(), moved.getMonth(), moved.getDate()]).toEqual([2026, 10, 2])
    expect([moved.getHours(), moved.getMinutes(), moved.getSeconds()]).toEqual([9, 45, 30])
  })

  it('keeps a late-evening time on the chosen LOCAL day (not the UTC day)', async () => {
    const { moveDueToDay } = await load()
    // 23:30 local in +05:30 is 18:00 UTC: the same calendar day either way, but 00:15 local is
    // 18:45 UTC of the day BEFORE, which is where a UTC-based implementation goes wrong.
    const due = new Date(2026, 9, 1, 0, 15).toISOString()
    const moved = new Date(moveDueToDay(due, '2026-10-05'))
    expect([moved.getDate(), moved.getHours(), moved.getMinutes()]).toEqual([5, 0, 15])
  })
})

describe('carriedLabel', () => {
  it('names the planned day and says it was carried, for any day before today', async () => {
    const { carriedLabel } = await load()
    expect(carriedLabel('2026-09-28', NOW())).toBe('原定9月28日，已顺延')
    expect(carriedLabel('2026-10-02', NOW())).toBe('原定昨天，已顺延')
    expect(carriedLabel('2025-12-31', NOW())).toBe('原定2025年12月31日，已顺延')
  })

  it('stays quiet for a plan on today, later, or none', async () => {
    const { carriedLabel } = await load()
    expect(carriedLabel('2026-10-03', NOW())).toBeNull()
    expect(carriedLabel('2026-10-04', NOW())).toBeNull()
    expect(carriedLabel(null, NOW())).toBeNull()
  })

  it('judges by the local calendar day, not the instant: 00:05 today is still today', async () => {
    const { carriedLabel } = await load()
    const justAfterMidnight = new Date(2026, 9, 3, 0, 5)
    expect(carriedLabel('2026-10-03', justAfterMidnight)).toBeNull()
    expect(carriedLabel('2026-10-02', justAfterMidnight)).not.toBeNull()
  })
})
