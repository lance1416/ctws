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
 * 1. THE ARITHMETIC is `date-fns` + `@date-fns/tz`'s `TZDate`. It used to be hand-written, and the
 *    hand-written version had already cost this repo three incidents: a test that was red for one
 *    hour in every twenty-four, a midnight-boundary bug, and a helper written to patch it. Two of
 *    the comments it carried were DST workarounds -- "round, not floor: a DST change makes a local
 *    day 23 or 25 hours" and "done in UTC so a DST change cannot shift the day". Neither is needed
 *    now: `differenceInCalendarDays` over two `TZDate`s counts CALENDAR days in a named zone, which
 *    is the question, so there is nothing left to round.
 *
 * 2. THE WORDING is this product's and stays hand-written. 今天 / 明天 / 昨天, 「10月8日」, 「已逾 N
 *    天」, 「原定…，已顺延」, and the decision to say a deadline in TWO phrases rather than one, are
 *    editorial choices no library makes. `date-fns/locale/zh-CN` would replace them with its own.
 *
 * WHOSE TODAY. Every function that needs to know what day it is takes an explicit IANA `timeZone`
 * and the caller passes the ACCOUNT's (`useTimeZone`). It used to read `getFullYear()/getMonth()/
 * getDate()`, i.e. the BROWSER's zone, while the server segments tasks with `at time zone $tz` on
 * the account's -- so a reader whose browser sat in another zone (travelling, a second machine, a
 * browser in a container) could see the server place a task in 逾期 while the row still read
 * 「明天截止」. There is one notion of "today" now and `todayIn` is it.
 */

/** A calendar day as "YYYY-MM-DD": the shape `scheduled_on` is stored and sent in. */
const DAY = 'yyyy-MM-dd'

/**
 * The browser's own zone, for the one moment the account's is not known yet (the `['me']` query is
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
 * and no DST rule can reach it. That is what the old `fromYmd`/`toYmd` pair was for; the pinning is
 * now the zone argument rather than a convention to remember.
 */
const dayStart = (day: string) => new TZDate(`${day}T00:00:00Z`, 'UTC')

/**
 * `TZDate#toISOString` keeps the zone's OFFSET ("…+05:30"), which is a correct ISO instant but not
 * the `Z` form the wire and the rest of this codebase use. One conversion, in one place.
 */
const utc = (d: Date) => new Date(d.getTime()).toISOString()

export function addDays(day: string, n: number): string {
  return format(addDaysFn(dayStart(day), n), DAY)
}

/** The Monday after `day` (always strictly later, so "下周" from a Monday is a week away). */
export function nextMonday(day: string): string {
  return format(nextMondayFn(dayStart(day)), DAY)
}

/** A calendar day as the reader says it: 今天 / 明天 / 昨天, else "10月8日" (with the year if it differs). */
export function dayPhrase(day: string, today: string): string {
  if (day === today) return '今天'
  if (day === addDays(today, 1)) return '明天'
  if (day === addDays(today, -1)) return '昨天'
  const [y, m, d] = day.split('-').map(Number)
  return today.slice(0, 4) === day.slice(0, 4) ? `${m}月${d}日` : `${y}年${m}月${d}日`
}

/**
 * The instant a day ENDS, in the account's zone: a new deadline with no time on it means "by the
 * end of that day". Both the 新建 dialog and the detail pane's named days pick this, and they must
 * pick the same thing -- the string concatenation they each did (`new Date(`${day}T23:59:00`)`)
 * read as the BROWSER's 23:59, which is a different instant and sometimes a different day.
 */
export function dayEndIso(day: string, timeZone: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return utc(new TZDate(y, m - 1, d, 23, 59, 0, 0, timeZone))
}

/**
 * "已逾 N 天" for an overdue instant, counted in the account's calendar days: a task due late
 * yesterday is 1 day overdue, not 0, whatever the hour. Never less than 1, since a task is only
 * overdue once its due day has passed.
 */
export function overdueLabel(dueIso: string, timeZone: string, now: Date = new Date()): string {
  const days = differenceInCalendarDays(
    new TZDate(now, timeZone),
    new TZDate(new Date(dueIso), timeZone),
  )
  return `已逾 ${Math.max(1, days)} 天`
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
  /** "排到明天": present whenever the task has a scheduled day. */
  scheduled: string | null
  /**
   * The deadline, worded in full and in TWO phrases: when it is, and -- once its day has gone --
   * how late it is. Two, not one string, because the row prints them as separate phrases: a single
   * 「10月4日 12:30 截止 · 已逾 2 天」 could not be broken anywhere, and inside a 375px row at
   * depth 3 an unbreakable 230px phrase is a horizontal scrollbar. Read in order they are the one
   * sentence §2 asks for.
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
 * disagree whenever they differ -- the server filing a task under 逾期 while the row beneath its
 * own heading read 「明天截止」. Same zone, same answer.
 *
 * THE WORDING IS COMPLETE, TO THE MINUTE (rows-and-reading §2, second edition). It lives on a line
 * of its own under the title now, not in an 8rem cell, so there is nothing to compress for: an
 * overdue deadline says WHEN it was -- 「10月4日 12:30 截止 · 已逾 2 天」 -- rather than only how
 * long ago. The previous edition shortened it to 「已逾 2 天」 because the cell was narrow, and the
 * user rejected exactly that compression: "已逾 2 天" cannot answer "due when?".
 */
export function dateHints(
  t: { status: string; dueAt: string | null; scheduledOn: string | null },
  timeZone: string,
  now: Date = new Date(),
): DateHints {
  if (t.status === 'done' || t.status === 'cancelled') return { scheduled: null, due: null }
  const today = todayIn(timeZone, now)
  const scheduled = t.scheduledOn ? `排到${dayPhrase(t.scheduledOn, today)}` : null
  if (!t.dueAt) return { scheduled, due: null }
  const due = new TZDate(new Date(t.dueAt), timeZone)
  const dueDay = format(due, DAY)
  const text = `${dayPhrase(dueDay, today)} ${format(due, 'HH:mm')} 截止`
  // Past its day: the same sentence, plus how long ago. Both halves, never one -- the day and the
  // time say WHICH deadline this is, and "已逾 N 天" is the urgency.
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
 * the clock to word the line ("已逾 5 天" against "明天 09:00 截止"), but whether there IS a
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
  return `原定${dayPhrase(scheduledOn, today)}，已顺延`
}
