import type { MeetingOccurrence, MeetingSeries } from '@ctws/contracts'
import type { OccurrenceRow, SeriesRow } from './queries'

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

export function toSeriesResponse(s: SeriesRow): MeetingSeries {
  return {
    id: s.id,
    title: s.title,
    startsLocal: s.startsLocal,
    timeZone: s.timeZone,
    durationMinutes: s.durationMinutes,
    rrule: s.rrule,
    location: s.location,
    note: s.note,
    projectId: s.projectId,
    projectName: s.projectName,
    attendees: s.attendees,
  }
}
