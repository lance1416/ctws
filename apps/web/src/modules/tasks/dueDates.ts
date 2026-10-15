import type { TaskStatus } from '@ctws/contracts'
import { isFinished } from './status'
import { TZDate } from '@date-fns/tz'
import { differenceInCalendarDays, set } from 'date-fns'
import {
  dayPhrase,
  daysAgoIn,
  toDayTimeInput,
  todayIn,
  utcIso,
  ymd,
} from '../../platform/time/dates'

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

/** An instant in the app's own words, "Tomorrow, 14:30", on the account's calendar and clock. */
export function instantPhrase(iso: string, today: string, timeZone: string): string {
  const [day, clock] = toDayTimeInput(iso, timeZone).split('T') as [string, string]
  return `${dayPhrase(day, today)}, ${clock}`
}

/** A deadline moved to another day, keeping its time of day in `timeZone`. */
export function moveDueToDay(dueIso: string, day: string, timeZone: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return utcIso(set(new TZDate(new Date(dueIso), timeZone), { year: y, month: m - 1, date: d }))
}

/**
 * How late an unfinished task is -- "2 days late" -- once its deadline's day has gone: the
 * server's rule, in the account's zone. Null for a finished task, however late it was.
 */
export function lateNote(
  t: { status: TaskStatus; dueAt: string | null },
  timeZone: string,
  now: Date,
): string | null {
  if (isFinished(t.status) || !t.dueAt) return null
  return ymd(new Date(t.dueAt), timeZone) < todayIn(timeZone, now)
    ? overdueLabel(t.dueAt, timeZone, now)
    : null
}
