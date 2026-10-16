import type { ProjectMovementResponse } from '@ctws/contracts'
import { addDays } from '@ctws/core/day'
import { shortDay, weekdayOf } from '../../../platform/time/dates'

/** How long a project with open work goes unchanged before the panel calls it quiet. */
export const QUIET_DAYS = 7

/** Open work that has gone unchanged for QUIET_DAYS or more. */
export const isQuiet = (r: ProjectMovementResponse) =>
  r.remaining > 0 && r.quietDays !== null && r.quietDays >= QUIET_DAYS

/** A project is worth a line when it has open work or finished something this week. */
export const hasMovement = (r: ProjectMovementResponse) => r.remaining > 0 || r.doneThisWeek > 0

/** When a project last moved, as a diary says it: today, yesterday, Thursday, or Sep 28. */
function movedWhen(day: string, today: string): string {
  if (day === today) return 'today'
  if (day === addDays(today, -1)) return 'yesterday'
  if (day >= addDays(today, -6)) return weekdayOf(day)
  return shortDay(day, today)
}

/**
 * This week's line for one project: what was done and when it last moved, or that it has gone
 * quiet. Never a ratio: the backend keeps no total to draw one against.
 */
export function movedLine(r: ProjectMovementResponse, today: string): string {
  if (isQuiet(r)) return `Quiet for ${r.quietDays} days`
  const done = r.doneThisWeek > 0 ? `${r.doneThisWeek} done` : null
  const when = r.lastActivityOn ? movedWhen(r.lastActivityOn, today) : null
  if (done && when) return `${done}, moved ${when}`
  if (done) return done
  if (when) return `Moved ${when}`
  return 'Not moved yet'
}
