import { addDays } from '@ctws/core/day'
import { monthDay, weekdayOf, ymd } from '../../../platform/time/dates'

/** The fourth column of a Today row (DES-001 section 4): when it is due, and how loudly. */
export type DueMark = { text: string; tone: 'today' | 'soon' | 'late' }

/**
 * A deadline as a Today row says it: "Due today", "Tomorrow", a weekday within the week, a date
 * after that, "7 days late" once missed. `today` is given; nothing here reads the clock.
 */
export function dueMark(dueAt: string | null, today: string, timeZone: string): DueMark | null {
  if (!dueAt) return null
  const day = ymd(new Date(dueAt), timeZone)
  if (day < today) {
    const late = Math.round((Date.parse(today) - Date.parse(day)) / 86_400_000)
    return { text: `${late} day${late === 1 ? '' : 's'} late`, tone: 'late' }
  }
  if (day === today) return { text: 'Due today', tone: 'today' }
  if (day === addDays(today, 1)) return { text: 'Tomorrow', tone: 'soon' }
  return { text: day <= addDays(today, 6) ? weekdayOf(day, true) : monthDay(day), tone: 'soon' }
}

/** "Carried from Sun": the day a plan was for, a weekday within the week, else its date. */
export function carriedFrom(planned: string, today: string): string {
  return `Carried from ${planned >= addDays(today, -6) ? weekdayOf(planned, true) : monthDay(planned)}`
}
