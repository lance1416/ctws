import type { MeetingOccurrence } from '@ctws/contracts'
import type { OccurrenceRow } from './queries'

export function toOccurrenceResponse(o: OccurrenceRow): MeetingOccurrence {
  return {
    meetingId: o.meetingId,
    recurrenceId: o.recurrenceId,
    title: o.title,
    startsLocal: o.startsLocal,
    timeZone: o.timeZone,
    durationMinutes: o.durationMinutes,
    startsAt: o.startsAt.toISOString(),
    endsAt: o.endsAt.toISOString(),
    rrule: o.rrule,
    overridden: o.overridden,
    location: o.location,
    note: o.note,
    projectId: o.projectId,
    projectName: o.projectName,
    attendees: o.attendees,
  }
}
