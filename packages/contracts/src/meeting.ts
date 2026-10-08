import { z } from 'zod'

/**
 * 会议 -- the fourth module, on iCalendar's `VEVENT` (RFC 5545).
 *
 * The properties kept are the ones every calendar has had for thirty years: `SUMMARY` (a title),
 * `DTSTART` / `DTEND` (two instants), `LOCATION`, `DESCRIPTION`, and `ATTENDEE` -- which here
 * points at the contacts module, since the whole reason an address book exists in a workbench is
 * to be the list you pick people out of.
 *
 * What is deliberately NOT modelled, each a real VEVENT feature and each a product of its own:
 * `RRULE` (recurrence, whose edge cases are a library's worth of work), invitations and replies
 * (`PARTSTAT`: mail, delivery, a second party's calendar), free/busy lookup, a per-event time
 * zone (`TZID` -- everything here is in the account's one zone), and alarms.
 *
 * A meeting is an INSTANT-to-INSTANT thing, not a calendar day: 「周四 14:00」 is the point of a
 * meeting in a way it is not the point of a deadline. The day it shows on is derived from the
 * start, by the server, in the account's zone.
 */

const instant = z.iso.datetime({ offset: true })
const title = z.string().trim().min(1).max(500)
const location = z.string().trim().min(1).max(500)
const note = z.string().max(10_000)

export const createMeetingBody = z
  .object({
    title,
    startsAt: instant,
    endsAt: instant,
    location: location.nullish(),
    note: note.nullish(),
    projectId: z.uuid().nullish(),
    /** The people in the room, out of the contacts module. */
    attendeeIds: z.array(z.uuid()).max(50).optional(),
  })
  .strict()
  // A meeting that ends before it starts is not a short meeting, it is a typo. The server refuses
  // it rather than storing something no view can draw.
  .refine((m) => Date.parse(m.endsAt) > Date.parse(m.startsAt), {
    message: 'a meeting has to end after it starts',
    path: ['endsAt'],
  })
export type CreateMeetingBody = z.infer<typeof createMeetingBody>

export const updateMeetingBody = z
  .object({
    title: title.optional(),
    startsAt: instant.optional(),
    endsAt: instant.optional(),
    location: location.nullable().optional(),
    note: note.nullable().optional(),
    projectId: z.uuid().nullable().optional(),
    attendeeIds: z.array(z.uuid()).max(50).optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: 'expected at least one field' })
  // Only when BOTH are sent: moving just the start is checked against the stored end, which only
  // the server knows.
  .refine((b) => !(b.startsAt && b.endsAt) || Date.parse(b.endsAt) > Date.parse(b.startsAt), {
    message: 'a meeting has to end after it starts',
    path: ['endsAt'],
  })
export type UpdateMeetingBody = z.infer<typeof updateMeetingBody>

export const meetingResponse = z
  .object({
    id: z.uuid(),
    title: z.string(),
    startsAt: instant,
    endsAt: instant,
    location: z.string().nullable(),
    note: z.string().nullable(),
    projectId: z.uuid().nullable(),
    projectName: z.string().nullable(),
    /** The people in the room, named, so a list needs no second request. */
    attendees: z.array(z.object({ id: z.uuid(), name: z.string() }).strict()),
    createdAt: instant,
    updatedAt: instant,
  })
  .strict()
export type MeetingResponse = z.infer<typeof meetingResponse>

export const meetingListQuery = z
  .object({
    projectId: z.uuid().optional(),
    /** Inclusive calendar days, in the account's zone. Absent means everything ahead. */
    from: z.string().optional(),
    to: z.string().optional(),
  })
  .strict()
