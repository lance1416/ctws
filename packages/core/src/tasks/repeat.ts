import { readTaskRule, type Repeat, type TaskRule } from '@ctws/contracts'
import { addDays } from '../day'

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
  const dayOfMonth = (target: number | null) => {
    const want = target ?? ad
    return want === -1 ? d === lastDayOf(y, m) : d === want
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

/** `day` plus `n` months, kept to the month's last day when it is shorter (Jan 31 → Feb 28). */
function addMonths(day: string, n: number): string {
  const [y, m, d] = ymd(day)
  const total = y * 12 + (m - 1) + n
  const year = Math.floor(total / 12)
  const month = (total % 12) + 1
  const dd = Math.min(d, lastDayOf(year, month))
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
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
  const next = firstFrom(rule, at.anchor, addDays(at.anchor, 1))
  if (next === null || next >= at.today) return next
  return firstFrom(rule, at.anchor, at.today)
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
