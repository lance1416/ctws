import { TZDate } from '@date-fns/tz'
import { format } from 'date-fns'
import { addDays, fullDay, monthDay, weekdayOf } from '../../platform/time/dates'

export type LeadTone = 'missed' | 'deadline' | 'plan' | 'time' | 'quiet'

/** What goes in the margin. `exact` is the moment in full, for the title. */
export type Lead = { text: string; tone: LeadTone; flag: boolean; exact?: string }

const weekdayOrDate = (day: string, today: string) =>
  day > today && day <= addDays(today, 6) ? weekdayOf(day, true) : monthDay(day)

/**
 * The row's margin: one short word about when, nearest commitment first (a deadline before a
 * plan). Today and the zone are arguments; nothing here reads the clock.
 */
export function leadFor(
  row: { dueAt: string | null; scheduledOn: string | null },
  today: string,
  tz: string,
): Lead | null {
  if (row.dueAt) {
    const due = new TZDate(new Date(row.dueAt), tz)
    const day = format(due, 'yyyy-MM-dd')
    const clock = format(due, 'HH:mm')
    const exact = `Due ${fullDay(day)}, ${clock}`
    // Missed: the day it was due. How late is the row's note on the right.
    if (day < today) return { text: monthDay(day), tone: 'missed', flag: true, exact }
    // 23:59 is the end of the day, so it reads as Today rather than as a time.
    if (day === today)
      return { text: clock === '23:59' ? 'Today' : clock, tone: 'deadline', flag: true, exact }
    // Tomorrow included: "Tomorrow" beside a flag is wider than the margin.
    return { text: weekdayOrDate(day, today), tone: 'deadline', flag: true, exact }
  }
  if (row.scheduledOn) {
    const day = row.scheduledOn
    // Tomorrow by its weekday too: "Tomorrow" is about 64px at 14px, and a phone's margin is 52.
    const text = day === today ? 'Today' : weekdayOrDate(day, today)
    return { text, tone: 'plan', flag: false, exact: `Planned for ${fullDay(day)}` }
  }
  return null
}

/** A deadline known only by its day, like a project's next one: with no time, today is "Today". */
export function deadlineDayLead(day: string, today: string): Lead {
  return {
    text: day === today ? 'Today' : weekdayOrDate(day, today),
    tone: 'deadline',
    flag: true,
    exact: `Next due ${fullDay(day)}`,
  }
}

/**
 * A day in a week under review: its weekday from the window's first day on, so last week reads
 * Mon to Sun, and its date before the window.
 */
export function weekDayWord(day: string, today: string, from: string): string {
  if (day === today) return 'Today'
  return day >= from && day < today ? weekdayOf(day, true) : monthDay(day)
}

/** One width for every list of tasks. */
export const LIST_MEASURE = 'max-w-[64rem]'
