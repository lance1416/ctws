import { z } from 'zod'
import { calendarDate, instant, viewQuery } from './common'
import { objectId } from './id'
import { linkCandidate } from './link'
import { objectType } from './object'

/**
 * A reminder: any one thing brought to Today on a day, with a line of why. One a thing, so a
 * second replaces the first; it hides nothing, the thing stays where it always shows.
 */

export const reminderParams = z.object({ type: objectType, id: objectId }).strict()

export const setReminderBody = z
  .object({
    /** The account's day it comes up on; "Later" sets another. */
    onDay: calendarDate,
    why: z.string().trim().min(1).max(200).nullish(),
  })
  .strict()

export const reminderResponse = z.object({
  /** The thing, named as a link to it would be. */
  object: linkCandidate,
  onDay: calendarDate,
  why: z.string().nullable(),
  createdAt: instant,
})

/** A thing's own reminder, or none: none is an answer, not a missing thing. */
export const reminderOfResponse = z.object({ reminder: reminderResponse.nullable() })

/** Today's block: every reminder whose day has come, oldest day first. */
export const remindersDueQuery = viewQuery('due')
export const remindersResponse = z.object({ reminders: z.array(reminderResponse) })
