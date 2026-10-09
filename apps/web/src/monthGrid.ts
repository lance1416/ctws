import { MONTHS } from './dueAt'

/**
 * THE MONTH GRID's arithmetic, kept away from the component that draws it.
 *
 * Every date here is a `YYYY-MM-DD` string in the ACCOUNT's zone, never a `Date`: a Date is an
 * instant, and an instant turned into a day by the browser is the browser's day, not the user's.
 * The same rule the rest of this app keeps about calendar days.
 */

/** Monday-first, like the weekly review's week. */
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

const parse = (day: string): [number, number, number] =>
  day.split('-').map(Number) as [number, number, number]

const fmt = (y: number, m: number, d: number): string =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

/** The day `n` days after `day`. Done in UTC, which has no DST, so no day is ever skipped. */
export function shiftDay(day: string, n: number): string {
  const [y, m, d] = parse(day)
  const at = new Date(Date.UTC(y, m - 1, d + n))
  return fmt(at.getUTCFullYear(), at.getUTCMonth() + 1, at.getUTCDate())
}

/** The month `n` months after the one `day` is in, as its first day. */
export function shiftMonth(day: string, n: number): string {
  const [y, m] = parse(day)
  const at = new Date(Date.UTC(y, m - 1 + n, 1))
  return fmt(at.getUTCFullYear(), at.getUTCMonth() + 1, 1)
}

/** 0 = Monday … 6 = Sunday. */
function weekdayOf(day: string): number {
  const [y, m, d] = parse(day)
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
}

const monthOf = (day: string): string => day.slice(0, 7)

/** 「2026年10月」 */
export function monthTitle(day: string): string {
  const [y, m] = parse(day)
  return `${MONTHS[m - 1]} ${y}`
}

/**
 * THE SQUARES a month is drawn on: whole weeks, Monday-first, so the grid is always rectangular
 * and the first row never starts with a gap.
 *
 * It deliberately returns the LEADING and TRAILING days of the neighbouring months rather than
 * blanks. A blank square says "nothing here"; a dimmed 9月30 says "this is last month", which is
 * the truth and is also where a Monday deadline at the start of a month actually lives.
 */
export function monthSquares(anyDayInMonth: string): { day: string; inMonth: boolean }[] {
  const month = monthOf(anyDayInMonth)
  const first = `${month}-01`
  const lead = weekdayOf(first)
  const start = shiftDay(first, -lead)
  const days = Number(shiftDay(shiftMonth(first, 1), -1).slice(8))
  // AS MANY WHOLE WEEKS AS THE MONTH NEEDS -- five or six. A fixed six would be steadier, but on
  // a month like 2026-10 the sixth row is entirely next month: an empty band under the grid that
  // reads as something failing to load. Whole weeks, never a ragged last row.
  const weeks = Math.ceil((lead + days) / 7)
  return Array.from({ length: weeks * 7 }, (_, i) => {
    const day = shiftDay(start, i)
    return { day, inMonth: monthOf(day) === month }
  })
}

/** The window a month's grid needs, inclusive at both ends. */
export function monthRange(anyDayInMonth: string): { from: string; to: string } {
  const squares = monthSquares(anyDayInMonth)
  return { from: squares[0]!.day, to: squares[squares.length - 1]!.day }
}
