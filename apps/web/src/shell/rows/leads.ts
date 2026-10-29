import { TZDate } from '@date-fns/tz'
import { format } from 'date-fns'
import { addDays } from '@ctws/core/day'
import { fullDay, monthDay, weekdayOf } from '../../platform/time/dates'

type LeadTone = 'missed' | 'deadline' | 'plan' | 'time' | 'quiet'

/** What goes in the margin. `exact` is the moment in full, for the title. */
export type Lead = { text: string; tone: LeadTone; flag: boolean; exact?: string }

/** A deadline at 23:59 is due by the end of its day: it has a day and no time. */
const END_OF_DAY = '23:59'

/** A deadline's day and clock on the account's calendar. */
function dueIn(dueAt: string, tz: string) {
  const due = new TZDate(new Date(dueAt), tz)
  return { day: format(due, 'yyyy-MM-dd'), clock: format(due, 'HH:mm') }
}

/** The clock a deadline today is due at; null on any other day, and by the end of today. */
export function dueTodayAt(dueAt: string | null, today: string, tz: string): string | null {
  if (!dueAt) return null
  const { day, clock } = dueIn(dueAt, tz)
  return day === today && clock !== END_OF_DAY ? clock : null
}

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
    const { day, clock } = dueIn(row.dueAt, tz)
    const exact = `Due ${fullDay(day)}, ${clock}`
    // Missed: the day it was due. How late is the row's note on the right.
    if (day < today) return { text: monthDay(day), tone: 'missed', flag: true, exact }
    // The end of the day reads as Today rather than as a time.
    if (day === today)
      return { text: clock === END_OF_DAY ? 'Today' : clock, tone: 'deadline', flag: true, exact }
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
