import { z } from 'zod'
import { idFrom, meetingId, personId, projectId } from './id'
import { EVENT_YEARS, eventTimeZone, instant, noteText, titleText } from './common'

/**
 * A meeting, after iCalendar's `VEVENT` (RFC 5545): a wall clock plus a zone and a duration, so a
 * weekly meeting stays at its local time across DST. `RRULE` is kept as the RFC's own string;
 * single occurrences are cancelled (`EXDATE`) or overridden (`RECURRENCE-ID`).
 */

const title = titleText
const location = z.string().trim().min(1).max(500)
const note = noteText

/** A wall clock with no zone, `YYYY-MM-DDTHH:mm`, as a `datetime-local` control produces. */
const localTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'expected a local time like 2026-10-20T09:00')
  .refine((v) => {
    const [date, clock] = v.split('T') as [string, string]
    const [y, m, d] = date.split('-').map(Number) as [number, number, number]
    const [hh, mm] = clock.split(':').map(Number) as [number, number]
    const at = new Date(Date.UTC(y, m - 1, d, hh, mm))
    return (
      at.getUTCFullYear() === y &&
      at.getUTCMonth() === m - 1 &&
      at.getUTCDate() === d &&
      hh < 24 &&
      mm < 60
    )
  }, 'not a real local time')
  // A series is expanded from its start, so a start far from now is work on every read.
  .refine((v) => {
    const year = Number(v.slice(0, 4))
    return year >= EVENT_YEARS.min && year <= EVENT_YEARS.max
  }, 'that is not a date anybody is meeting on')

/** Minutes; at most a day and a half. */
const durationMinutes = z
  .number()
  .int()
  .min(1)
  .max(60 * 36)

/** The `RRULE` body, length only: the server checks it with the library that expands it (422). */
const rrule = z.string().trim().min(1).max(500)

/**
 * `UNTIL` is in the same naive wall-clock space as the series' start, stamped `Z`, so a series
 * ends at the local time it names; a real UTC instant would end it an evening early west of
 * Greenwich.
 */
const UNTIL_STAMP = /^UNTIL=(\d{4})(\d{2})(\d{2})T\d{6}Z$/i

const ruleParts = (rule: string) =>
  rule
    .replace(/^RRULE:/i, '')
    .split(';')
    .filter((part) => part !== '')

/**
 * The same rule, ending at `last`: a wall clock `YYYY-MM-DDTHH:mm:ss` in the series' zone,
 * inclusive. A rule ends one way, so `COUNT` goes too. With `last` null the rule never ends.
 */
export function ruleEndingAt(rule: string, last: string | null): string {
  const body = ruleParts(rule).filter((p) => !/^UNTIL=/i.test(p))
  if (last === null) return body.join(';')
  const stamp = `${last.replaceAll('-', '').replaceAll(':', '')}Z`
  return [...body.filter((p) => !/^COUNT=/i.test(p)), `UNTIL=${stamp}`].join(';')
}

/** The day a rule stops on, as `YYYY-MM-DD`, or null when it never does. */
export function ruleEndDay(rule: string | null): string | null {
  for (const part of rule ? ruleParts(rule) : []) {
    const found = UNTIL_STAMP.exec(part)
    if (found) return `${found[1]}-${found[2]}-${found[3]}`
  }
  return null
}

export const meetingParams = z.object({ id: meetingId }).strict()

/** What a meeting is; null clears a field. A new one needs its title, time and length. */
const meetingFields = {
  title,
  startsLocal: localTime,
  timeZone: eventTimeZone,
  durationMinutes,
  rrule: rrule.nullable(),
  location: location.nullable(),
  note: note.nullable(),
  projectId: projectId.nullable(),
  attendeeIds: z.array(personId).max(50),
}

export const createMeetingBody = z
  .object(meetingFields)
  .partial()
  .required({ title: true, startsLocal: true, timeZone: true, durationMinutes: true })
  .strict()
export type CreateMeetingBody = z.infer<typeof createMeetingBody>

/**
 * Which occurrences an edit touches: `one`, `following` (the series is split there), or `all`. A
 * meeting that happens once takes `all` whatever is asked.
 */
const editScope = z.enum(['one', 'following', 'all'])
export type EditScope = z.infer<typeof editScope>

export const updateMeetingBody = z
  .object({
    /** Required for anything but `all`. */
    scope: editScope.default('all'),
    recurrenceId: localTime.optional(),
    ...z.object(meetingFields).partial().shape,
  })
  .strict()
  .refine((b) => Object.keys(b).some((k) => k !== 'scope' && k !== 'recurrenceId'), {
    message: 'expected at least one field',
  })
  .refine((b) => b.scope === 'all' || b.recurrenceId !== undefined, {
    message: 'editing one occurrence needs to say which',
    path: ['recurrenceId'],
  })
export type UpdateMeetingBody = z.infer<typeof updateMeetingBody>
/** What a client sends: `scope` may be left out because the schema defaults it. */
export type UpdateMeetingInput = z.input<typeof updateMeetingBody>

/** One occurrence of a meeting, as every read returns it. */
export const meetingOccurrence = z
  .object({
    /** The series. */
    meetingId,
    /** The local time the rule gave this occurrence; it does not change when the occurrence moves. */
    recurrenceId: localTime,
    title: z.string(),
    /** Where it actually is, after an override: a wall clock in `timeZone`. */
    startsLocal: localTime,
    timeZone: eventTimeZone,
    durationMinutes: z.number().int(),
    startsAt: instant,
    endsAt: instant,
    rrule: z.string().nullable(),
    /** True when this occurrence differs from its series. */
    overridden: z.boolean(),
    location: z.string().nullable(),
    note: z.string().nullable(),
    projectId: projectId.nullable(),
    projectName: z.string().nullable(),
    attendees: z.array(z.object({ id: personId, name: z.string() }).strict()),
  })
  .strict()
export type MeetingOccurrence = z.infer<typeof meetingOccurrence>

type OccurrenceName = Pick<MeetingOccurrence, 'meetingId' | 'recurrenceId'>

/**
 * One occurrence as a single string, `<series uuid>:<recurrence id>`: its calendar entry's id and
 * its key in a list. A series shows several times on one grid, so the series id alone is not one.
 */
export const occurrenceKey = (o: OccurrenceName): string => `${o.meetingId}:${o.recurrenceId}`

/** The occurrence an `occurrenceKey` names. A uuid has no colon, so the first one splits it. */
export function parseOccurrenceKey(key: string): OccurrenceName {
  const at = key.indexOf(':')
  return { meetingId: idFrom(meetingId, key.slice(0, at)), recurrenceId: key.slice(at + 1) }
}

export const meetingsResponse = z.object({ meetings: z.array(meetingOccurrence) }).strict()

/** Which occurrence of a series. */
export const occurrenceQuery = z.object({ recurrenceId: localTime }).strict()

/** Cancelling one occurrence is not cancelling the series. */
export const deleteMeetingQuery = z
  .object({ scope: editScope.default('all'), recurrenceId: localTime.optional() })
  .strict()
  .refine((q) => q.scope === 'all' || q.recurrenceId !== undefined, {
    message: 'cancelling one occurrence needs to say which',
    path: ['recurrenceId'],
  })
