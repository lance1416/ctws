import { z } from 'zod'

/**
 * How a task comes round again. By the calendar, a rule in RFC 5545's words, the same words a
 * meeting's series is kept in, so the page says both the same way ("Weekly on Tuesday"). Or a
 * while after it is done, counted from the day it was done.
 */

const FREQS = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const
type Freq = (typeof FREQS)[number]

/** RFC 5545's weekday codes, Sunday first as `Date.getUTCDay` counts. */
export const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const
type WeekdayCode = (typeof WEEKDAY_CODES)[number]

/** A task's calendar rule, read: what each part of the subset a task takes says. */
export type TaskRule = {
  freq: Freq
  /** Every `interval`th day, week, month or year. */
  interval: number
  /** Weekly: the days of the week, `getUTCDay` numbers. Empty: the day the task is on. */
  byDay: number[]
  /** Monthly or yearly: the day of the month, -1 for the last. Null: the day the task is on. */
  byMonthDay: number | null
  /** Yearly: the month, 1 to 12. Null: the month the task is on. */
  byMonth: number | null
  /** The last day it may fall on, `YYYY-MM-DD`; null runs on. */
  until: string | null
}

/**
 * A rule in the subset a task takes, read; or why not, as a sentence. A task is a day's work, so
 * no times of day: `UNTIL` is a date, and BYHOUR and the like are refused rather than ignored.
 */
export function readTaskRule(rule: string): TaskRule | string {
  const parts = new Map<string, string>()
  for (const part of rule.replace(/^RRULE:/i, '').split(';')) {
    const [key, value, extra] = part.split('=')
    if (!key || value === undefined || extra !== undefined) return `"${part}" is not KEY=VALUE`
    if (parts.has(key.toUpperCase())) return `${key} is given twice`
    parts.set(key.toUpperCase(), value.toUpperCase())
  }
  const freq = parts.get('FREQ')
  if (!freq || !(FREQS as readonly string[]).includes(freq)) {
    return 'FREQ must be DAILY, WEEKLY, MONTHLY or YEARLY'
  }
  for (const key of parts.keys()) {
    if (!['FREQ', 'INTERVAL', 'BYDAY', 'BYMONTHDAY', 'BYMONTH', 'UNTIL'].includes(key)) {
      return `${key} is not part of a task's rule`
    }
  }
  const interval = Number(parts.get('INTERVAL') ?? '1')
  if (!Number.isInteger(interval) || interval < 1 || interval > 99) {
    return 'INTERVAL must be a whole number from 1 to 99'
  }
  const byDay: number[] = []
  const days = parts.get('BYDAY')
  if (days !== undefined) {
    if (freq !== 'WEEKLY') return 'BYDAY is for a weekly rule'
    for (const code of days.split(',')) {
      const at = WEEKDAY_CODES.indexOf(code as WeekdayCode)
      if (at === -1) return `BYDAY takes MO to SU, not ${code}`
      if (!byDay.includes(at)) byDay.push(at)
    }
  }
  let byMonthDay: number | null = null
  const monthDay = parts.get('BYMONTHDAY')
  if (monthDay !== undefined) {
    if (freq !== 'MONTHLY' && freq !== 'YEARLY') return 'BYMONTHDAY is for a monthly or yearly rule'
    byMonthDay = Number(monthDay)
    const ok =
      Number.isInteger(byMonthDay) && (byMonthDay === -1 || (byMonthDay >= 1 && byMonthDay <= 31))
    if (!ok) return 'BYMONTHDAY must be 1 to 31, or -1 for the last day'
  }
  let byMonth: number | null = null
  const month = parts.get('BYMONTH')
  if (month !== undefined) {
    if (freq !== 'YEARLY') return 'BYMONTH is for a yearly rule'
    byMonth = Number(month)
    if (!Number.isInteger(byMonth) || byMonth < 1 || byMonth > 12) return 'BYMONTH must be 1 to 12'
  }
  let until: string | null = null
  const end = parts.get('UNTIL')
  if (end !== undefined) {
    const m = /^(\d{4})(\d{2})(\d{2})$/.exec(end)
    if (!m) return 'UNTIL must be a date, YYYYMMDD'
    until = `${m[1]}-${m[2]}-${m[3]}`
  }
  return { freq: freq as Freq, interval, byDay: byDay.sort(), byMonthDay, byMonth, until }
}

const taskRule = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .superRefine((rule, ctx) => {
    const read = readTaskRule(rule)
    if (typeof read === 'string') ctx.addIssue({ code: 'custom', message: read })
  })

export const REPEAT_UNITS = ['day', 'week', 'month'] as const

export const repeat = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('rule'), rule: taskRule }).strict(),
  z
    .object({
      kind: z.literal('after'),
      every: z.number().int().min(1).max(365),
      unit: z.enum(REPEAT_UNITS),
    })
    .strict(),
])
export type Repeat = z.infer<typeof repeat>
