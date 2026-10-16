import { addDays } from '@ctws/core/day'
import { MONTHS } from '../../platform/time/dates'

/**
 * The month grid's arithmetic. Every date is a `YYYY-MM-DD` day in the account's zone, never a
 * `Date`: an instant turned into a day by the browser is the browser's day, not the user's.
 */

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

const parse = (day: string): [number, number, number] =>
  day.split('-').map(Number) as [number, number, number]

const fmt = (y: number, m: number, d: number): string =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

/** The month `n` months after the one `day` is in, as its first day. */
export function shiftMonth(day: string, n: number): string {
  const [y, m] = parse(day)
  const at = new Date(Date.UTC(y, m - 1 + n, 1))
  return fmt(at.getUTCFullYear(), at.getUTCMonth() + 1, 1)
}

/** 0 on a Monday … 6 on a Sunday. */
function daysSinceMonday(day: string): number {
  const [y, m, d] = parse(day)
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
}

const monthOf = (day: string): string => day.slice(0, 7)

/** "Oct 2026". */
export function monthTitle(day: string): string {
  const [y, m] = parse(day)
  return `${MONTHS[m - 1]} ${y}`
}

/**
 * Whole Monday-first weeks, with the neighbouring months' days rather than blanks: a dimmed Sep 30
 * is still a day a deadline can fall on.
 */
export function monthSquares(anyDayInMonth: string): { day: string; inMonth: boolean }[] {
  const month = monthOf(anyDayInMonth)
  const first = `${month}-01`
  const lead = daysSinceMonday(first)
  const start = addDays(first, -lead)
  const days = Number(addDays(shiftMonth(first, 1), -1).slice(8))
  // Five or six weeks as the month needs: a fixed six can leave a whole row of next month.
  const weeks = Math.ceil((lead + days) / 7)
  return Array.from({ length: weeks * 7 }, (_, i) => {
    const day = addDays(start, i)
    return { day, inMonth: monthOf(day) === month }
  })
}

/** The window a month's grid needs, inclusive at both ends. */
export function monthRange(anyDayInMonth: string): { from: string; to: string } {
  const squares = monthSquares(anyDayInMonth)
  return { from: squares[0]!.day, to: squares[squares.length - 1]!.day }
}
