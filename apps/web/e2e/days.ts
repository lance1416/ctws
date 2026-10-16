/**
 * THE SUITE'S DATE ARITHMETIC, in the runner's local days. The browser registers its user with its
 * own zone, so the account's days and the runner's are the same; `timezone.spec.ts` sets another
 * zone and computes its own.
 */

/** The month names the app prints, so a spec can build the string the page will show. */
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
]

/** One day in milliseconds. */
export const DAY = 86_400_000

/** A deadline `days` ago, as an instant. */
export const dueAgo = (days: number): string => new Date(Date.now() - days * DAY).toISOString()

/** A local calendar day, `YYYY-MM-DD`. */
export const ymd = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** `n` days from today, as a calendar day. Negative is the past. */
export function dayOffset(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return ymd(d)
}

/** The Monday the app's "Plan for next week" means: the next one, never today. */
export function nextMondayYmd(): string {
  const d = new Date()
  d.setDate(d.getDate() + (d.getDay() === 0 ? 1 : 8 - d.getDay()))
  return ymd(d)
}

/** `n` days after `day` (negative is before). Noon UTC, so no offset can push it across a boundary. */
export function addDaysYmd(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** The calendar day after `day`. */
export const dayAfter = (day: string): string => addDaysYmd(day, 1)
