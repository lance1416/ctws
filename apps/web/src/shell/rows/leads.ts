import { TZDate } from '@date-fns/tz'
import { format } from 'date-fns'
import { addDays, fullDay, MONTHS } from '../../platform/time/dates'

/**
 * THE MARGIN: what a row says about WHEN, in front of everything else on it.
 *
 * A row is `[margin][thread][marker, title, meta, note]`. The margin is a column of its own at the
 * row's left -- right-aligned, tabular, one short line -- so the eye can run down a list's times
 * and dates the way it runs down a diary's, and the title owns the rest of the line. The date's
 * whole wording used to sit on a second line under every dated title; it is now this one word,
 * and the exact moment is its title.
 *
 * NEAREST COMMITMENT FIRST, one thing only: a deadline (missed, or standing) before a plan, a plan
 * before a bare time. A row with a plan and a deadline shows the deadline, because it is the one
 * that bites; the plan is in the sheet.
 *
 * NOTHING HERE READS THE CLOCK. Today and the zone are arguments, so the same row says the same
 * thing in a test at any hour, and the caller's notion of today is the only one.
 */

export type LeadTone = 'missed' | 'deadline' | 'plan' | 'time' | 'quiet'

/** What goes in the margin. `exact` is the moment in full, for the title. */
export type Lead = { text: string; tone: LeadTone; flag: boolean; exact?: string }

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/** `Oct 8`. Never the year: the margin is one short line, and the exact moment carries it. */
const monthDay = (day: string) => {
  const [, m, d] = day.split('-').map(Number) as [number, number, number]
  return `${MONTHS[m - 1]} ${d}`
}

/** A day in the week ahead is its weekday; anything else is its date. */
const weekdayOrDate = (day: string, today: string) =>
  day > today && day <= addDays(today, 6)
    ? WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()]!
    : monthDay(day)

export function leadFor(
  row: { dueAt: string | null; scheduledOn: string | null; at?: string | null },
  today: string,
  tz: string,
): Lead | null {
  if (row.dueAt) {
    const due = new TZDate(new Date(row.dueAt), tz)
    const day = format(due, 'yyyy-MM-dd')
    const clock = format(due, 'HH:mm')
    const exact = `Due ${fullDay(day)}, ${clock}`
    // Gone: the day it was due. How LATE is the row's right-hand note, not this.
    if (day < today) return { text: monthDay(day), tone: 'missed', flag: true, exact }
    // Today: the time, unless it is the end of the day, which is a day and not a time -- 23:59
    // would read as a deadline at midnight.
    if (day === today)
      return { text: clock === '23:59' ? 'Today' : clock, tone: 'deadline', flag: true, exact }
    // A deadline later in the week is its weekday, tomorrow included: "Tomorrow" beside a flag is
    // wider than the margin, and Tue is no less clear four days out than one.
    return { text: weekdayOrDate(day, today), tone: 'deadline', flag: true, exact }
  }
  if (row.scheduledOn) {
    const day = row.scheduledOn
    // Tomorrow by its weekday, as a deadline is: "Tomorrow" is the widest word the margin could
    // hold (63.7px at 14px, measured), and a phone's margin leaves it 52.
    const text = day === today ? 'Today' : weekdayOrDate(day, today)
    return { text, tone: 'plan', flag: false, exact: `Planned for ${fullDay(day)}` }
  }
  if (row.at) {
    return { text: format(new TZDate(new Date(row.at), tz), 'HH:mm'), tone: 'time', flag: false }
  }
  return null
}

/**
 * A DEADLINE KNOWN ONLY BY ITS DAY -- a project's next one, which the server answers as a day in
 * the account's zone -- in the words the margin gives any deadline: Today, a weekday in the week
 * ahead, else its date. There is no time to give, so a deadline today is "Today".
 */
export function deadlineDayLead(day: string, today: string): Lead {
  return {
    text: day === today ? 'Today' : weekdayOrDate(day, today),
    tone: 'deadline',
    flag: true,
    exact: `Next due ${fullDay(day)}`,
  }
}

/**
 * A DAY IN A WEEK UNDER REVIEW: Today, else its weekday from the window's first day on -- so every
 * day of last week reads Mon to Sun, not its Monday as a date and the rest by weekday -- and its
 * date before the window.
 */
export function weekDayWord(day: string, today: string, from: string): string {
  if (day === today) return 'Today'
  return day >= from && day < today
    ? WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()]!
    : monthDay(day)
}

/**
 * HOW WIDE A LIST IS -- one value, for every list of tasks.
 *
 * The title competes with nothing on its right but a short note, so there is one measure; 64rem is
 * the measure of a title-only list, which is the only kind there is.
 */
export const LIST_MEASURE = 'max-w-[64rem]'
