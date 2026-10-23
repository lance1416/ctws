import { clockTime } from '@ctws/core/clock'
import { monthDay, weekdayOf, ymd } from './dates'

const WEEK_MS = 7 * 86_400_000

/**
 * When a meeting starts, where things of every kind are listed (DES-001 section 4): within a week
 * of now the weekday and time ("Thu 14:00"), further off the day ("Sep 30"). On the reader's clock.
 */
export function meetingWhen(startsAt: string, timeZone: string, now: Date): string {
  const at = new Date(startsAt)
  const day = ymd(at, timeZone)
  return Math.abs(at.getTime() - now.getTime()) < WEEK_MS
    ? `${weekdayOf(day, true)} ${clockTime(at, timeZone)}`
    : monthDay(day)
}
