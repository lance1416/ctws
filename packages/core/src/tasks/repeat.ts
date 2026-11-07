import { readTaskRule, type Repeat, type TaskRule } from '@ctws/contracts'
import { addDays, addMonths } from '../day'

const DAY_MS = 86_400_000
const ms = (day: string) => Date.parse(`${day}T00:00:00Z`)
const daysBetween = (a: string, b: string) => Math.round((ms(b) - ms(a)) / DAY_MS)
const weekdayOf = (day: string) => new Date(ms(day)).getUTCDay()
const ymd = (day: string) => day.split('-').map(Number) as [number, number, number]
const lastDayOf = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()

/** The Monday of `day`'s week: RFC 5545 counts weeks from Monday unless told otherwise. */
const mondayOf = (day: string) => addDays(day, -((weekdayOf(day) + 6) % 7))

/** Whether `day` is one the rule lands on, counting its intervals from `anchor`. */
function lands(rule: TaskRule, anchor: string, day: string): boolean {
  const [ay, am, ad] = ymd(anchor)
  const [y, m, d] = ymd(day)
  // A day a month does not have falls on that month's last: the 31st on the 30th, February 29th
  // on the 28th in a year without one. The next month goes back to its 31st.
  const dayOfMonth = (target: number | null) => {
    const want = target ?? ad
    return want === -1 ? d === lastDayOf(y, m) : d === Math.min(want, lastDayOf(y, m))
  }
  switch (rule.freq) {
    case 'DAILY':
      return daysBetween(anchor, day) % rule.interval === 0
    case 'WEEKLY': {
      const weeks = daysBetween(mondayOf(anchor), mondayOf(day)) / 7
      const days = rule.byDay.length > 0 ? rule.byDay : [weekdayOf(anchor)]
      return weeks % rule.interval === 0 && days.includes(weekdayOf(day))
    }
    case 'MONTHLY':
      return ((y - ay) * 12 + (m - am)) % rule.interval === 0 && dayOfMonth(rule.byMonthDay)
    case 'YEARLY':
      return (
        (y - ay) % rule.interval === 0 && m === (rule.byMonth ?? am) && dayOfMonth(rule.byMonthDay)
      )
  }
}

/** The first day from `from` on (itself included) that the rule lands on, or null past `until`. */
function firstFrom(rule: TaskRule, anchor: string, from: string): string | null {
  // Enough to reach the rarest day a rule can name, a February 29th, at its widest interval.
  const span = 366 * 8 * rule.interval
  for (let i = 0; i <= span; i++) {
    const day = addDays(from, i)
    if (rule.until !== null && day > rule.until) return null
    if (lands(rule, anchor, day)) return day
  }
  return null
}

/**
 * The day the next one falls on, after one on `anchor` was done or cancelled on `doneOn`; null
 * when a rule has run out. By the calendar: the rule's next day after `anchor`, or, when that
 * has already gone by, its first day from today on: missed ones are not made up. After done: the
 * while counted from the day it was done. All days `YYYY-MM-DD`, `today` and `doneOn` in the
 * account's zone; nothing here reads a clock.
 */
export function nextRepeatDay(
  repeat: Repeat,
  at: { anchor: string; today: string; doneOn: string },
): string | null {
  if (repeat.kind === 'after') {
    const { every, unit } = repeat
    if (unit === 'month') return addMonths(at.doneOn, every)
    return addDays(at.doneOn, unit === 'week' ? every * 7 : every)
  }
  const rule = readTaskRule(repeat.rule)
  if (typeof rule === 'string') return null
  // After today, not from it: what was just done does not come back the same day.
  const earliest = at.anchor >= at.today ? addDays(at.anchor, 1) : addDays(at.today, 1)
  return firstFrom(rule, at.anchor, earliest)
}

/**
 * The repeat to hand on to the next one. A monthly or yearly rule that leans on the day it was
 * written on, and that day is the 29th to the 31st, is made to say it: the next one may fall on a
 * shorter month's last day, and would otherwise count its months from there.
 */
export function handOn(repeat: Repeat, anchor: string): Repeat {
  if (repeat.kind !== 'rule') return repeat
  const rule = readTaskRule(repeat.rule)
  if (typeof rule === 'string' || rule.byMonthDay !== null) return repeat
  const [, month, day] = ymd(anchor)
  if (day <= 28 || (rule.freq !== 'MONTHLY' && rule.freq !== 'YEARLY')) return repeat
  const parts = [repeat.rule.replace(/^RRULE:/i, '')]
  if (rule.freq === 'YEARLY' && rule.byMonth === null) parts.push(`BYMONTH=${month}`)
  parts.push(`BYMONTHDAY=${day}`)
  return { kind: 'rule', rule: parts.join(';') }
}

/**
 * The first day a new repeating task falls on, from today on, today included: what a capture
 * like "Pay rent every month on the 1st" is planned for when it names no day of its own.
 */
export function firstRepeatDay(repeat: Repeat, today: string): string | null {
  if (repeat.kind === 'after') return today
  const rule = readTaskRule(repeat.rule)
  return typeof rule === 'string' ? null : firstFrom(rule, today, today)
}
