import { TZDate } from '@date-fns/tz'
import { differenceInCalendarDays, format, nextMonday as nextMondayFn } from 'date-fns'

import { addDays } from '@ctws/core/day'

/** A calendar day as "YYYY-MM-DD": the shape days are stored and sent in. */
const DAY = 'yyyy-MM-dd'

/** The browser's zone, only while the account's is not known yet; UTC when it will not say. */
export function browserZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/**
 * Which calendar day an instant falls on, in `timeZone`: the account's zone, never the browser's,
 * since the server decides a thing's day in that zone.
 */
export function ymd(instant: Date, timeZone: string): string {
  return format(new TZDate(instant, timeZone), DAY)
}

// Day strings carry no zone, so their arithmetic is done in UTC, where no DST rule applies.
const dayStart = (day: string) => new TZDate(`${day}T00:00:00Z`, 'UTC')

/** An instant in the wire's `…Z` form; `TZDate#toISOString` would keep the zone's offset. */
export const utcIso = (d: Date) => new Date(d.getTime()).toISOString()

/** The Monday after `day`, always strictly later. */
export function nextMonday(day: string): string {
  return format(nextMondayFn(dayStart(day)), DAY)
}

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

/** `Oct 8`, without the year. */
export function monthDay(day: string): string {
  const [, m, d] = day.split('-').map(Number) as [number, number, number]
  return `${MONTHS[m - 1]} ${d}`
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** The weekday `day` falls on: "Monday", or "Mon" when `short`. */
export function weekdayOf(day: string, short = false): string {
  const name = WEEKDAYS[new Date(`${day}T12:00:00Z`).getUTCDay()]!
  return short ? name.slice(0, 3) : name
}

/** Today, Tomorrow or Yesterday; null for any other day. */
export function nearDay(day: string, today: string): string | null {
  if (day === today) return 'Today'
  if (day === addDays(today, 1)) return 'Tomorrow'
  if (day === addDays(today, -1)) return 'Yesterday'
  return null
}

/** Today, Tomorrow or Yesterday, else `shortDay`. */
export function dayPhrase(day: string, today: string): string {
  return nearDay(day, today) ?? shortDay(day, today)
}

/** `Fri, Oct 2`, or `Fri, Jan 2, 2027` outside this year. */
export function weekdayDay(day: string, today: string): string {
  return `${weekdayOf(day, true)}, ${shortDay(day, today)}`
}

/** `Friday, October 2`: a day as a page's heading. */
export function longDay(day: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${day}T12:00:00Z`))
}

/** `Oct 12`, or `Apr 15, 2027` outside this year. */
export function shortDay(day: string, today: string): string {
  return today.slice(0, 4) === day.slice(0, 4) ? fullDay(day).replace(/, \d+$/, '') : fullDay(day)
}

/** `Oct 17, 1991`: a day always read with its year. */
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

/** The instant a day ends in `timeZone`: a deadline with no time means "by the end of that day". */
export function dayEndIso(day: string, timeZone: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return utcIso(new TZDate(y, m - 1, d, 23, 59, 0, 0, timeZone))
}

export function daysAgoIn(iso: string, timeZone: string, now: Date): number {
  return differenceInCalendarDays(new TZDate(now, timeZone), new TZDate(new Date(iso), timeZone))
}

/** An instant as the "YYYY-MM-DDTHH:mm" a `datetime-local` input shows, in `timeZone`. */
export function toDayTimeInput(iso: string | null, timeZone: string): string {
  if (!iso) return ''
  return format(new TZDate(new Date(iso), timeZone), "yyyy-MM-dd'T'HH:mm")
}

/** A `datetime-local` value read as a wall clock in `timeZone`, the input itself having none. */
export function fromDayTimeInput(v: string, timeZone: string): string | null {
  const s = v.trim()
  if (s === '') return null
  const [date, clock = '00:00'] = s.split('T') as [string, string?]
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const [hh, mm] = clock.split(':').map(Number) as [number, number]
  return utcIso(new TZDate(y, m - 1, d, hh, mm, 0, 0, timeZone))
}
