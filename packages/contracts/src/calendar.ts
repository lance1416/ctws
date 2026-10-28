import { z } from 'zod'
import { objectId, projectId } from './id'
import { objectType } from './object'
import { BIRTH_YEARS } from './birthday'
import { calendarDate, DAY_MS, EVENT_YEARS, instant, viewQuery } from './common'

/**
 * The widest window a read may ask for. A recurring series has no last occurrence, so the window
 * is the work: a grid shows six weeks and the longest view is a year.
 */
export const MAX_CALENDAR_SPAN_DAYS = 370

type Window = { from?: string | undefined; to?: string | undefined }

/** Ordered, inside `years`, and no wider than `MAX_CALENDAR_SPAN_DAYS`. Either end may be absent. */
function windowWithin(q: Window, years: { min: number; max: number }): boolean {
  const [floor, ceiling] = [`${years.min}-01-01`, `${years.max}-12-31`]
  if (q.from && (q.from < floor || q.from > ceiling)) return false
  if (q.to && (q.to < floor || q.to > ceiling)) return false
  if (!q.from || !q.to) return true
  if (q.to < q.from) return false
  return (Date.parse(q.to) - Date.parse(q.from)) / DAY_MS <= MAX_CALENDAR_SPAN_DAYS
}

/**
 * Whether a window of dated things is one worth answering: inside the years events happen in. A
 * series is expanded from its own start forward to the window, so the distance is work too.
 */
export const windowIsBounded = (q: Window) => windowWithin(q, EVENT_YEARS)

export const WINDOW_REFUSED = 'that is not a window anybody is looking at'

/**
 * A window of lunar day names, inclusive at both ends. Nothing is expanded, so it reaches back as
 * far as a birth year can, with a year either side for the grid's margin round its month.
 */
export const lunarDaysQuery = z
  .object({ from: calendarDate, to: calendarDate })
  .strict()
  .refine((q) => windowWithin(q, { min: BIRTH_YEARS.min - 1, max: BIRTH_YEARS.max + 1 }), {
    message: WINDOW_REFUSED,
    path: ['to'],
  })

/** A collection's dated things on their days: `?view=calendar&from=&to=` on its own path. */
export const calendarView = viewQuery('calendar', { from: calendarDate, to: calendarDate }).refine(
  windowIsBounded,
  { message: WINDOW_REFUSED, path: ['to'] },
)

/** What an entry's date is to the thing: a machine value, which the web puts into words. */
const CALENDAR_KINDS = ['planned', 'due', 'to-read', 'birthday', 'occurrence', 'follow-up'] as const

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
  /** Where to join, for a meeting held on a call (Today's "Join"). */
  joinUrl: z.string().nullable(),
  projectId: projectId.nullable(),
  projectName: z.string().nullable(),
})
export type CalendarEntry = z.infer<typeof calendarEntry>

export const calendarEntriesResponse = z.object({ entries: z.array(calendarEntry) })

/** Each day's lunar name, for the grid's squares, and the festival a day is, on the days that are one. */
export const calendarDaysResponse = z.object({
  days: z.record(calendarDate, z.string()),
  festivals: z.record(calendarDate, z.string()),
})

/** A week's window for what the modules count of it, inclusive days in the account's zone. */
export const weekCountsQuery = z
  .object({ from: calendarDate, to: calendarDate })
  .strict()
  .refine(windowIsBounded, { message: WINDOW_REFUSED, path: ['to'] })

/**
 * What each module counted of the window, by the name it gives: "meetingsHeld", "peopleAdded". The
 * review's "Also this week" (FR-081); the web words them.
 */
export const weekCountsResponse = z.object({ counts: z.record(z.string(), z.number().int()) })
