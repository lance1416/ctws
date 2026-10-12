import { TZDate } from '@date-fns/tz'
import {
  addDays as addDaysFn,
  differenceInCalendarDays,
  format,
  nextMonday as nextMondayFn,
  set,
} from 'date-fns'

/**
 * DATES, IN THE ACCOUNT'S TIMEZONE -- which is the ONLY timezone this file knows about.
 *
 * Two things live here and they are not the same kind of thing:
 *
 * 1. THE ARITHMETIC is `date-fns` + `@date-fns/tz`'s `TZDate`, never hand-rolled. A local day is
 *    23 or 25 hours long across a DST change, which is what makes day arithmetic by subtraction
 *    wrong for one hour in every twenty-four. `differenceInCalendarDays` over two `TZDate`s counts
 *    CALENDAR days in a named zone, which is the question being asked, so there is nothing to
 *    round and no boundary to patch.
 *
 * 2. THE WORDING is this product's and stays hand-written. Today / Tomorrow / Yesterday, "Oct 8",
 *    "2 days late", "Was Sep 28, carried", and the decision to say a deadline in TWO phrases
 *    rather than one, are editorial choices no library makes. A date-fns locale would replace
 *    them with its own.
 *
 * WHOSE TODAY. Every function that needs to know what day it is takes an explicit IANA `timeZone`,
 * and the caller passes the ACCOUNT's (`useTimeZone`). The browser's zone is never consulted: the
 * server segments tasks with `at time zone $tz` on the account's, so a reader in another zone
 * (travelling, a second machine, a browser in a container) would otherwise see the server call a
 * task overdue while its own row said it was due tomorrow. `todayIn` is the one notion of today.
 */

/** A calendar day as "YYYY-MM-DD": the shape `scheduled_on` is stored and sent in. */
const DAY = 'yyyy-MM-dd'

/**
 * The browser's own zone, for the one moment the account's is not known yet (the `["me"]` query is
 * in flight, or there is no session). It is a fallback and never a second answer: as soon as `me`
 * lands, `useTimeZone` returns the account's and every phrase is recomputed from it.
 */
export function browserZone(): string {
  return new Intl.DateTimeFormat().resolvedOptions().timeZone
}

/** Which calendar day an instant falls on, in `timeZone`. */
export function ymd(instant: Date, timeZone: string): string {
  return format(new TZDate(instant, timeZone), DAY)
}

/**
 * TODAY, and the only definition of it in the web app. The same string
 * `Intl.DateTimeFormat('en-CA', { timeZone })` produced at the three places that each worked it out
 * for themselves, and the same day the API's `date_trunc('day', clock at time zone $tz)` picks.
 */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return ymd(now, timeZone)
}

/**
 * Arithmetic on a calendar-day STRING has no timezone in it at all -- "the day after 2026-10-31" is
 * 2026-11-01 everywhere -- so it is done on a `TZDate` pinned to UTC, where every day is 24 hours
 * and no DST rule can reach it. The pinning is the zone argument, not a convention to remember.
 */
const dayStart = (day: string) => new TZDate(`${day}T00:00:00Z`, 'UTC')

/**
 * `TZDate#toISOString` keeps the zone's OFFSET ("…+05:30"), which is a correct ISO instant but not
 * the `Z` form the wire and the rest of this codebase use. One conversion, in one place.
 */
const utc = (d: Date) => new Date(d.getTime()).toISOString()

/**
 * A day phrase inside a sentence. "Today" and "Tomorrow" are words there, not proper nouns; a
 * month name still is, so only the first letter is touched.
 */
const lower = (phrase: string) =>
  /^(Today|Tomorrow|Yesterday)$/.test(phrase) ? phrase.toLowerCase() : phrase

export function addDays(day: string, n: number): string {
  return format(addDaysFn(dayStart(day), n), DAY)
}

/** The Monday after `day` (always strictly later, so "next week" from a Monday is a week away). */
export function nextMonday(day: string): string {
  return format(nextMondayFn(dayStart(day)), DAY)
}

/** Month names, shared by every surface that prints a short date. */
export const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

/** A calendar day as the reader says it: Today / Tomorrow / Yesterday, else "Oct 8" (with the year if it differs). */
export function dayPhrase(day: string, today: string): string {
  if (day === today) return 'Today'
  if (day === addDays(today, 1)) return 'Tomorrow'
  if (day === addDays(today, -1)) return 'Yesterday'
  return shortDay(day, today)
}

/**
 * `Oct 12`, or `Apr 15, 2027` when it is not this year. It deliberately never says "Today": where
 * this is used the column beside it says the distance, and a row that says one thing twice is a
 * row the reader has to hold two of.
 */
export function shortDay(day: string, today: string): string {
  return today.slice(0, 4) === day.slice(0, 4) ? fullDay(day).replace(/, \d+$/, '') : fullDay(day)
}

/**
 * `Oct 17, 1991`: a day that is always read with its year -- a birthday, the day a person was
 * born. The same words `shortDay` uses, so a date never appears as `1991-10-17` beside them.
 */
export function fullDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return `${MONTHS[m - 1]} ${d}, ${y}`
}

/** How far off something is: `today`, `tomorrow`, `in 23 days`. */
export function countdownPhrase(inDays: number): string {
  if (inDays === 0) return 'today'
  if (inDays === 1) return 'tomorrow'
  return `in ${inDays} days`
}

/**
 * The instant a day ENDS, in the account's zone: a new deadline with no time on it means "by the
 * end of that day". Both the New task dialog and the detail pane's named days pick this, and they
 * must pick the same thing -- composing the string by hand (`new Date(`${day}T23:59:00`)`) reads
 * as the BROWSER's 23:59, which is a different instant and sometimes a different day.
 */
export function dayEndIso(day: string, timeZone: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return utc(new TZDate(y, m - 1, d, 23, 59, 0, 0, timeZone))
}

/**
 * "N days late" for an overdue instant, counted in the account's calendar days: a task due late
 * yesterday is 1 day overdue, not 0, whatever the hour. Never less than 1, since a task is only
 * overdue once its due day has passed.
 */
export function overdueLabel(dueIso: string, timeZone: string, now: Date = new Date()): string {
  const days = differenceInCalendarDays(
    new TZDate(now, timeZone),
    new TZDate(new Date(dueIso), timeZone),
  )
  const days_ = Math.max(1, days)
  return `${days_} day${days_ === 1 ? '' : 's'} late`
}

/**
 * HOW MANY CALENDAR DAYS AGO, in the account's zone. The arithmetic only; each module words it,
 * because "captured 3 days ago" and "added 3 days ago" are the same count said by different
 * modules about different things, and the shell owns the clock rather than the vocabulary.
 */

/**
 * "Captured 3 days ago" -- how long something has been sitting in the inbox, counted in the
 * account's calendar days like every other phrase here.
 *
 * A COUNT, not a date. `dayPhrase` would say "Captured Oct 1", which answers a question nobody asked:
 * the inbox is read to find what has gone stale, and "17 days" is that answer where "October 1st"
 * is arithmetic the reader has to do. Today and yesterday keep their names, because for those two
 * the count reads worse than the word.
 */
export function daysAgoIn(iso: string, timeZone: string, now: Date = new Date()): number {
  return differenceInCalendarDays(new TZDate(now, timeZone), new TZDate(new Date(iso), timeZone))
}

export function capturedLabel(
  createdIso: string,
  timeZone: string,
  now: Date = new Date(),
): string {
  const days = daysAgoIn(createdIso, timeZone, now)
  if (days <= 0) return 'Captured today'
  if (days === 1) return 'Captured yesterday'
  return `Captured ${days} days ago`
}

/**
 * A deadline moved to another calendar day, keeping its time of day (in the account's zone, to the
 * second). Pushing "due 09:00 on the 1st" to the 4th gives 09:00 on the 4th: the person is moving
 * the date, so inventing midnight (which reads as "due at the very start of the day") or "now"
 * would be changing something they did not touch.
 */
export function moveDueToDay(dueIso: string, day: string, timeZone: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return utc(set(new TZDate(new Date(dueIso), timeZone), { year: y, month: m - 1, date: d }))
}

/** An instant as the "YYYY-MM-DDTHH:mm" a `datetime-local` input shows, in the account's zone. */
export function toDayTimeInput(iso: string | null, timeZone: string): string {
  if (!iso) return ''
  return format(new TZDate(new Date(iso), timeZone), "yyyy-MM-dd'T'HH:mm")
}

/**
 * The inverse: a `datetime-local` value read as a wall clock in the ACCOUNT's zone, as the instant
 * the contract takes. A `datetime-local` control carries no zone of its own -- its value is bare
 * wall-clock text -- so SOMETHING has to say which zone it means, and the browser's own would be a
 * second notion of the day beside `todayIn`'s.
 */
export function fromDayTimeInput(v: string, timeZone: string): string | null {
  const s = v.trim()
  if (s === '') return null
  const [date, clock = '00:00'] = s.split('T') as [string, string?]
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const [hh, mm] = clock.split(':').map(Number) as [number, number]
  return utc(new TZDate(y, m - 1, d, hh, mm, 0, 0, timeZone))
}

export type DateHints = {
  /** "Planned for tomorrow": present whenever the task has a scheduled day. */
  scheduled: string | null
  /**
   * The deadline, worded in full and in TWO phrases: when it is, and -- once its day has gone --
   * how late it is. Two, not one string, because the row prints them as separate phrases: a single
   * "Due Oct 4, 12:30 · 2 days late" could not be broken anywhere, and inside a 375px row at depth
   * 3 an unbreakable 230px phrase is a horizontal scrollbar. Read in order they are the one
   * sentence the row asks for.
   */
  due: { text: string; late: string | null; overdue: boolean } | null
}

/**
 * The date cues worth showing on a row. A finished or cancelled task shows none: its dates no
 * longer tell the reader anything. Overdue uses the same rule as the server's segment cascade
 * (the deadline is before the start of today), and the same label as the Today page.
 *
 * `timeZone` is the ACCOUNT's, and it is not optional. The segment a task is in is decided by the
 * server in that zone; if this wording were worked out in the browser's instead, the two would
 * disagree whenever they differ -- the server filing a task under Overdue while the row beneath its
 * own heading read "Due tomorrow". Same zone, same answer.
 *
 * THE WORDING IS COMPLETE, TO THE MINUTE. It lives on a line of its own under the title, not in an
 * 8rem cell, so there is nothing to compress for: an overdue deadline says WHEN it was -- "Due Oct
 * 4, 12:30 · 2 days late" -- and not only how long ago, because "2 days late" cannot answer "due
 * when?".
 */
export function dateHints(
  t: { status: string; dueAt: string | null; scheduledOn: string | null },
  timeZone: string,
  now: Date = new Date(),
): DateHints {
  if (t.status === 'done' || t.status === 'cancelled') return { scheduled: null, due: null }
  const today = todayIn(timeZone, now)
  const scheduled = t.scheduledOn ? `Planned for ${lower(dayPhrase(t.scheduledOn, today))}` : null
  if (!t.dueAt) return { scheduled, due: null }
  const due = new TZDate(new Date(t.dueAt), timeZone)
  const dueDay = format(due, DAY)
  const text = `Due ${lower(dayPhrase(dueDay, today))}, ${format(due, 'HH:mm')}`
  // Past its day: the same sentence, plus how long ago. Both halves, never one -- the day and the
  // time say WHICH deadline this is, and "N days late" is the urgency.
  if (dueDay < today)
    return { scheduled, due: { text, late: overdueLabel(t.dueAt, timeZone, now), overdue: true } }
  return { scheduled, due: { text, late: null, overdue: false } }
}

/**
 * WHETHER A ROW HAS EACH KIND OF DATE -- the same two answers `dateHints` gives, with the CLOCK
 * TAKEN OUT.
 *
 * A list decides whether it reserves the leading icon slot from every one of its rows (`rowLead`),
 * and that decision must not be able to disagree with what the rows then render. `dateHints` reads
 * the clock to word the line ("5 days late" against "Due tomorrow, 09:00"), but whether there IS a
 * deadline never depends on it: a deadline that has passed is still a deadline, and still an icon.
 * So this is the predicate, and `dateHints.test.ts` pins that the two agree -- including at an
 * instant where the wording changes, and in a zone other than the process's, which is where a
 * clock-reading predicate would drift.
 */
export function dateMarks(t: {
  status: string
  dueAt: string | null
  scheduledOn: string | null
}): { due: boolean; plan: boolean } {
  if (t.status === 'done' || t.status === 'cancelled') return { due: false, plan: false }
  return { due: t.dueAt !== null, plan: t.scheduledOn !== null }
}

/**
 * The mark on a plan that has been carried: planned for a day that has already passed and still
 * not done, in the account's zone. Null for a plan on today or later (today's own plans stay
 * quiet) and for no plan. It names the planned day and says it was carried; it is deliberately not
 * worded like the overdue label, since a missed plan is not a missed deadline.
 */
export function carriedLabel(
  scheduledOn: string | null,
  timeZone: string,
  now: Date = new Date(),
): string | null {
  if (!scheduledOn) return null
  const today = todayIn(timeZone, now)
  if (scheduledOn >= today) return null
  return `Carried over from ${lower(dayPhrase(scheduledOn, today))}`
}
