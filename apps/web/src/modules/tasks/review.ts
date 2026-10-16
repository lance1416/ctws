import { addDays } from '@ctws/core/day'

type Week = { from: string; to: string }

/** The whole week before the one starting on `monday`. */
export const weekBefore = (monday: string): Week => ({
  from: addDays(monday, -7),
  to: addDays(monday, -1),
})

/** The week after the one starting on `monday`, or null when that is this week (the default view). */
export function weekAfter(monday: string, thisMonday: string): Week | null {
  const next = addDays(monday, 7)
  return next >= thisMonday ? null : { from: next, to: addDays(next, 6) }
}
