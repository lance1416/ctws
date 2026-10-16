import { REVIEW_TRANSITIONS, type ReviewList, type ReviewResponse } from '@ctws/contracts'
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

/** The lists in the order a project shows them. */
const LISTS = Object.keys(REVIEW_TRANSITIONS) as ReviewList[]

/**
 * A project's rows, list by list. A task can be in two lists (started and finished in one week),
 * so a row is keyed by its list as well as its task.
 */
export const reviewRows = (p: ReviewResponse['projects'][number]) =>
  LISTS.flatMap((list) => p[list].map((task) => ({ key: `${list}:${task.id}`, list, task })))
