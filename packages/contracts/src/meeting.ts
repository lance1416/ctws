import { z } from 'zod'
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

export const createMeetingBody = z
  .object({
    title,
    startsLocal: localTime,
    timeZone: eventTimeZone,
    durationMinutes,
    rrule: rrule.nullish(),
    location: location.nullish(),
    note: note.nullish(),
    projectId: z.uuid().nullish(),
    attendeeIds: z.array(z.uuid()).max(50).optional(),
  })
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
    title: title.optional(),
    startsLocal: localTime.optional(),
    timeZone: eventTimeZone.optional(),
    durationMinutes: durationMinutes.optional(),
    rrule: rrule.nullable().optional(),
    location: location.nullable().optional(),
    note: note.nullable().optional(),
    projectId: z.uuid().nullable().optional(),
    attendeeIds: z.array(z.uuid()).max(50).optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).some((k) => k !== 'scope'), {
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
    meetingId: z.uuid(),
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
    projectId: z.uuid().nullable(),
    projectName: z.string().nullable(),
    attendees: z.array(z.object({ id: z.uuid(), name: z.string() }).strict()),
  })
  .strict()
export type MeetingOccurrence = z.infer<typeof meetingOccurrence>

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
