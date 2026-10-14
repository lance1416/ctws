import type { ProjectMovementResponse } from '@ctws/contracts'
import { addDays, MONTHS } from '../../platform/time/dueAt'

/**
 * The judgements the movement panel makes, kept out of the component so they can be tested as
 * what they are: rules about when a project is worth a line and when one has gone quiet.
 */

/** A project has to have been quiet this long before the panel says so. One working week. */
export const QUIET_DAYS = 7

/** "Sep 28", or "Sep 28, 2025" when it is not this year. */
export function activityLabel(day: string, today: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return today.slice(0, 4) === day.slice(0, 4)
    ? `${MONTHS[m - 1]} ${d}`
    : `${MONTHS[m - 1]} ${d}, ${y}`
}

/** A project is worth a line when it has open work or finished something this week. */
export const hasMovement = (r: ProjectMovementResponse) => r.remaining > 0 || r.doneThisWeek > 0

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** When a project last moved, as a diary says it: today, yesterday, Thursday, or Sep 28. */
function movedWhen(day: string, today: string): string {
  if (day === today) return 'today'
  if (day === addDays(today, -1)) return 'yesterday'
  if (day >= addDays(today, -6)) return WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()]!
  return activityLabel(day, today)
}

/**
 * THIS WEEK'S LINE FOR ONE PROJECT: what was done, and when it last moved -- or, for a project
 * with open work and no change for a week, that it has gone quiet. Counts and days, never a
 * ratio: a percentage would be drawn against numbers the backend does not keep.
 */
export function movedLine(r: ProjectMovementResponse, today: string): string {
  if (r.remaining > 0 && r.quietDays !== null && r.quietDays >= QUIET_DAYS)
    return `Quiet for ${r.quietDays} days`
  const done = r.doneThisWeek > 0 ? `${r.doneThisWeek} done` : null
  const when = r.lastActivityOn ? movedWhen(r.lastActivityOn, today) : null
  if (done && when) return `${done}, moved ${when}`
  if (done) return done
  if (when) return `Moved ${when}`
  return 'Not moved yet'
}
