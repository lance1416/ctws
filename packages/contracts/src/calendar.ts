import { z } from 'zod'
import { projectId } from './id'
import { calendarDate, DAY_MS, EVENT_YEARS, viewQuery } from './common'

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

/**
 * One dated thing on the calendar. The server puts it on its day in the account's zone; `kind` is
 * the module's own word for what the date is.
 */
const calendarEntry = z
  .object({
    id: z.string(),
    day: calendarDate,
    title: z.string(),
    /** Where clicking it goes, inside the app. */
    to: z.string(),
    kind: z.string(),
    /** The time of day in the account's zone, for a thing that has one; squares sort by it. */
    time: z.string().nullable(),
    /** When it ends on the same clock, for a thing that lasts. */
    endTime: z.string().nullable(),
    /** The zone it was agreed in ("EDT"), when that is not the account's. */
    zone: z.string().nullable(),
    projectId: projectId.nullable(),
    projectName: z.string().nullable(),
  })
  .strict()
export type CalendarEntry = z.infer<typeof calendarEntry>

export const calendarEntriesResponse = z.object({ entries: z.array(calendarEntry) }).strict()

/** Each day's lunar name, for the grid's squares. */
export const calendarDaysResponse = z.object({ days: z.record(calendarDate, z.string()) }).strict()
