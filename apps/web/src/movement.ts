import type { ProjectMovementResponse } from '@ctws/contracts'
import { MONTHS } from './dueAt'

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

/**
 * The one line the panel says out loud, or null when nothing has actually gone quiet.
 *
 * Only a project with OPEN WORK can be stagnant: a line of work that is finished has nothing left
 * to do and is not waiting for anybody. Among those, the quietest wins, so the sentence is stable
 * rather than depending on which project happened to sort first.
 */
export function stagnant(rows: ProjectMovementResponse[]): ProjectMovementResponse | null {
  const quiet = rows.filter(
    (r) => r.remaining > 0 && r.quietDays !== null && r.quietDays >= QUIET_DAYS,
  )
  if (quiet.length === 0) return null
  return quiet.reduce((worst, r) => (r.quietDays! > worst.quietDays! ? r : worst))
}

/** A project is worth a line when it has open work or finished something this week. */
export const hasMovement = (r: ProjectMovementResponse) => r.remaining > 0 || r.doneThisWeek > 0
