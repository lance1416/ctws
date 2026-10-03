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

  it('a deadline before the start of today is overdue and says how many days', async () => {
    const { dateHints } = await load()
    // 2026-10-01 09:00 local is two calendar days before the 3rd.
    const due = new Date(2026, 9, 1, 9, 0).toISOString()
    expect(dateHints(task({ dueAt: due }), NOW()).due).toEqual({ text: '已逾 2 天', overdue: true })
  })

  it('a deadline earlier today is not overdue (the server cascade only tests the day boundary)', async () => {
    const { dateHints } = await load()
    const due = new Date(2026, 9, 3, 8, 0).toISOString()
    expect(dateHints(task({ dueAt: due }), NOW()).due).toEqual({
      text: '今天 08:00 截止',
      overdue: false,
    })
  })

  it('a future deadline and a scheduled day each get their own phrase', async () => {
    const { dateHints } = await load()
    const due = new Date(2026, 9, 8, 9, 0).toISOString()
    expect(dateHints(task({ dueAt: due, scheduledOn: '2026-10-04' }), NOW())).toEqual({
      scheduled: '排到明天',
      due: { text: '10月8日截止', overdue: false },
    })
  })

  it('an overdue task that has been rescheduled shows both', async () => {
    const { dateHints } = await load()
    const due = new Date(2026, 9, 1, 9, 0).toISOString()
    expect(dateHints(task({ dueAt: due, scheduledOn: '2026-10-04' }), NOW())).toEqual({
      scheduled: '排到明天',
      due: { text: '已逾 2 天', overdue: true },
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
