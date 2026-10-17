import { z } from 'zod'
import { objectId, projectId } from './id'
import { objectType } from './object'
import { calendarDate, DAY_MS, EVENT_YEARS, instant, viewQuery } from './common'

/**
 * The widest window a read may ask for. A recurring series has no last occurrence, so the window
 * is the work: a grid shows six weeks and the longest view is a year.
 */
export const MAX_CALENDAR_SPAN_DAYS = 370

const FLOOR = `${EVENT_YEARS.min}-01-01`
const CEILING = `${EVENT_YEARS.max}-12-31`

/**
 * Whether a date window is one worth answering: inside the years events happen in, ordered, and
 * no wider than `MAX_CALENDAR_SPAN_DAYS`. Either end may be absent.
 */
export function windowIsBounded(q: {
  from?: string | undefined
  to?: string | undefined
}): boolean {
  if (q.from && (q.from < FLOOR || q.from > CEILING)) return false
  if (q.to && (q.to < FLOOR || q.to > CEILING)) return false
  if (!q.from || !q.to) return true
  if (q.to < q.from) return false
  return (Date.parse(q.to) - Date.parse(q.from)) / DAY_MS <= MAX_CALENDAR_SPAN_DAYS
}

export const WINDOW_REFUSED = 'that is not a window anybody is looking at'

/** Inclusive at both ends. */
export const calendarQuery = z
  .object({ from: calendarDate, to: calendarDate })
  .strict()
  .refine(windowIsBounded, { message: WINDOW_REFUSED, path: ['to'] })

/** A collection's dated things on their days: `?view=calendar&from=&to=` on its own path. */
export const calendarView = viewQuery('calendar', { from: calendarDate, to: calendarDate }).refine(
  windowIsBounded,
  { message: WINDOW_REFUSED, path: ['to'] },
)

/** What an entry's date is to the thing: a machine value, which the web puts into words. */
const CALENDAR_KINDS = ['planned', 'due', 'to-read', 'birthday', 'occurrence'] as const

/**
 * One dated thing on the calendar. The server puts it on its day in the account's zone and says
 * which thing it is and what is known of it; where it opens and how it is said are the web's.
 */
const calendarEntry = z.object({
  type: objectType,
  /** The thing's own id: a task, a reading item, a person, a meeting series. */
  id: objectId,
  kind: z.enum(CALENDAR_KINDS),
  /** Which occurrence of a series, for a meeting; null for everything else. */
  recurrenceId: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    .nullable(),
  day: calendarDate,
  title: z.string(),
  /** When it starts and ends, for a thing at a time of day. */
  startsAt: instant.nullable(),
  endsAt: instant.nullable(),
  /** The zone its time was agreed in, for a thing at a time of day. */
  timeZone: z.string().nullable(),
  /** The age a birthday turns, when the year of birth is known. */
  turns: z.number().int().nullable(),
  projectId: projectId.nullable(),
  projectName: z.string().nullable(),
})
export type CalendarEntry = z.infer<typeof calendarEntry>

export const calendarEntriesResponse = z.object({ entries: z.array(calendarEntry) })

/** Each day's lunar name, for the grid's squares. */
export const calendarDaysResponse = z.object({ days: z.record(calendarDate, z.string()) })
