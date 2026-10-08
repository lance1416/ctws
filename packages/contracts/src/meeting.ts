import { z } from 'zod'
import { calendarDate, MAX_CALENDAR_SPAN_DAYS } from './task'

/**
 * 会议 -- the fourth module, on iCalendar's `VEVENT` (RFC 5545).
 *
 * A meeting is a WALL CLOCK PLUS A ZONE, not an instant: 「每周二多伦多时间 09:00」 is at 09:00 in
 * Toronto forever, and its UTC instant moves twice a year. A series stored as an instant and
 * advanced by seven days would hold the instant still and move the meeting for the people in the
 * room. A duration rather than an end, for the same reason.
 *
 * `RRULE` is kept as the RFC's own string, so an ics export and a rule the interface does not yet
 * offer both cost nothing in the data. Single occurrences are cancelled (`EXDATE`) or overridden
 * (`RECURRENCE-ID`) one at a time.
 *
 * Not modelled: invitations and replies (`PARTSTAT` -- mail, delivery, a second party's calendar),
 * free/busy lookup, and alarms. Each is a product of its own.
 */

const instant = z.iso.datetime({ offset: true })
const title = z.string().trim().min(1).max(500)
const location = z.string().trim().min(1).max(500)
const note = z.string().max(10_000)

/**
 * A wall clock with no zone: `YYYY-MM-DDTHH:mm`. The shape a `datetime-local` control produces,
 * and deliberately NOT an instant -- an instant would have had to pick a zone to be written in.
 */
export const localTime = z
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
  /**
   * A MEETING IS SOMETHING YOU SCHEDULE, so it starts within a human range.
   *
   * Not tidiness: a daily series starting in year 1 makes the expansion walk from there to the
   * window on every read -- measured at 64ms for one series against 3ms for a normal one, and it
   * is paid per series per request.
   */
  .refine((v) => {
    const year = Number(v.slice(0, 4))
    return year >= 1970 && year <= 2200
  }, 'that is not a date anybody is meeting on')

/**
 * An IANA zone name, checked by asking the platform rather than against a list that would rot.
 * Every runtime this project uses ships a full tz database.
 */
export const timeZone = z
  .string()
  .min(1)
  .max(100)
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: tz })
      return true
    } catch {
      return false
    }
  }, 'not a time zone this system knows')

/** Minutes. A meeting of no length is a typo; a day and a half is as long as this allows. */
const durationMinutes = z
  .number()
  .int()
  .min(1)
  .max(60 * 36)

/**
 * The `RRULE` body, without its `RRULE:` prefix. LENGTH ONLY.
 *
 * It deliberately does not inspect the rule. An earlier version matched `FREQ=(SECONDLY|…)` and
 * `INTERVAL=(\d+)` with regexes, which is a second parser beside the real one -- and two parsers
 * disagree about whitespace, repeated parts and number formats, so a string can be refused here
 * and accepted there, or the reverse. The server decides with the library that will expand it,
 * and says why (422).
 */
const rrule = z.string().trim().min(1).max(500)

export const createMeetingBody = z
  .object({
    title,
    startsLocal: localTime,
    timeZone,
    durationMinutes,
    rrule: rrule.nullish(),
    location: location.nullish(),
    note: note.nullish(),
    projectId: z.uuid().nullish(),
    /** The people in the room, out of the contacts module. */
    attendeeIds: z.array(z.uuid()).max(50).optional(),
  })
  .strict()
export type CreateMeetingBody = z.infer<typeof createMeetingBody>

/**
 * WHICH OCCURRENCES AN EDIT TOUCHES.
 *
 * - `one`: this one only (`RECURRENCE-ID` override, or `EXDATE` for a delete).
 * - `following`: this one and every one after it -- the series is split, which is what every
 *   calendar does because RFC 5545 has no "change from here" and the past must stay as it was.
 * - `all`: the whole series.
 *
 * A meeting that happens once takes `all` whatever is asked, because the three are the same thing.
 */
export const EDIT_SCOPES = ['one', 'following', 'all'] as const
export const editScope = z.enum(EDIT_SCOPES)
export type EditScope = z.infer<typeof editScope>

export const updateMeetingBody = z
  .object({
    /** Which occurrence the edit is aimed at. Required for anything but `all`. */
    scope: editScope.default('all'),
    recurrenceId: localTime.optional(),
    title: title.optional(),
    startsLocal: localTime.optional(),
    timeZone: timeZone.optional(),
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
/**
 * What a CLIENT sends: `scope` is optional here because the schema defaults it. The server's own
 * type has it present, which is the whole point of a default -- one side may leave it out and the
 * other never has to wonder whether it is there.
 */
export type UpdateMeetingInput = z.input<typeof updateMeetingBody>

/** One occurrence of a meeting, as every read returns it. */
export const meetingOccurrence = z
  .object({
    /** The series. Several occurrences share it. */
    meetingId: z.uuid(),
    /**
     * Which occurrence: the local time the RULE put it at. It does not change when the occurrence
     * is moved, which is what makes it the occurrence's identity.
     */
    recurrenceId: localTime,
    title: z.string(),
    /** Where it actually is, after an override: a wall clock in `timeZone`. */
    startsLocal: localTime,
    timeZone,
    durationMinutes: z.number().int(),
    /** The instants, so a client never has to do zone arithmetic to sort or compare. */
    startsAt: instant,
    endsAt: instant,
    /** The series' rule, so an occurrence can say 「每周二」 without a second request. */
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

export const meetingListQuery = z
  .object({
    projectId: z.uuid().optional(),
    /** Inclusive calendar days in the ACCOUNT's zone. Absent means a window the server picks. */
    from: calendarDate.optional(),
    to: calendarDate.optional(),
  })
  .strict()
  // The same bound the calendar keeps, for the same reason: this is the same question with the
  // days named differently, and a series has no last occurrence to stop at.
  .refine(
    (q) =>
      !q.from ||
      !q.to ||
      (Date.parse(q.to) >= Date.parse(q.from) &&
        (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000 <= MAX_CALENDAR_SPAN_DAYS),
    { message: `a window is at most ${MAX_CALENDAR_SPAN_DAYS} days`, path: ['to'] },
  )

/** Deleting takes a scope too: cancelling one week is not cancelling the series. */
export const deleteMeetingQuery = z
  .object({ scope: editScope.default('all'), recurrenceId: localTime.optional() })
  .strict()
  .refine((q) => q.scope === 'all' || q.recurrenceId !== undefined, {
    message: 'cancelling one occurrence needs to say which',
    path: ['recurrenceId'],
  })
