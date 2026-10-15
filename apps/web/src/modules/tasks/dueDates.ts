import type { TaskStatus } from '@ctws/contracts'
import { isFinished } from './status'
import { TZDate } from '@date-fns/tz'
import { differenceInCalendarDays, format, set } from 'date-fns'
import { dayPhrase, daysAgoIn, todayIn, utcIso, ymd } from '../../platform/time/dates'

/** "N days late", in calendar days: a task due late yesterday is 1 day late, whatever the hour. */
export function overdueLabel(dueIso: string, timeZone: string, now: Date): string {
  const days = Math.max(
    1,
    differenceInCalendarDays(new TZDate(now, timeZone), new TZDate(new Date(dueIso), timeZone)),
  )
  return `${days} day${days === 1 ? '' : 's'} late`
}

/** How long something has sat in the inbox, as a count: "17 days" is what a stale inbox asks. */
export function capturedLabel(createdIso: string, timeZone: string, now: Date): string {
  const days = daysAgoIn(createdIso, timeZone, now)
  if (days <= 0) return 'Captured today'
  if (days === 1) return 'Captured yesterday'
  return `Captured ${days} days ago`
}

/** A deadline moved to another day, keeping its time of day in `timeZone`. */
export function moveDueToDay(dueIso: string, day: string, timeZone: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return utcIso(set(new TZDate(new Date(dueIso), timeZone), { year: y, month: m - 1, date: d }))
}

// "Today" and "Tomorrow" inside a sentence are words, not names.
const lower = (phrase: string) =>
  /^(Today|Tomorrow|Yesterday)$/.test(phrase) ? phrase.toLowerCase() : phrase

export type DateHints = {
  /** "Planned for tomorrow", when the task has a planned day. */
  scheduled: string | null
  /**
   * The deadline in two phrases, when and (once past) how late, so a narrow row can break between
   * them.
   */
  due: { text: string; late: string | null; overdue: boolean } | null
}

/**
 * The date cues for a row. A finished task shows none. Overdue means the deadline's day is before
 * today, the server's rule, in the account's zone.
 */
export function dateHints(
  t: { status: TaskStatus; dueAt: string | null; scheduledOn: string | null },
  timeZone: string,
  now: Date,
): DateHints {
  if (isFinished(t.status)) return { scheduled: null, due: null }
  const today = todayIn(timeZone, now)
  const scheduled = t.scheduledOn ? `Planned for ${lower(dayPhrase(t.scheduledOn, today))}` : null
  if (!t.dueAt) return { scheduled, due: null }
  const dueDay = ymd(new Date(t.dueAt), timeZone)
  const text = `Due ${lower(dayPhrase(dueDay, today))}, ${format(new TZDate(new Date(t.dueAt), timeZone), 'HH:mm')}`
  if (dueDay < today)
    return { scheduled, due: { text, late: overdueLabel(t.dueAt, timeZone, now), overdue: true } }
  return { scheduled, due: { text, late: null, overdue: false } }
}
