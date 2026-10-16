import {
  type CalendarEntry,
  DAY_MS,
  occurrenceKey,
  type MeetingId,
  type PersonId,
  type ProjectId,
  type WorkspaceId,
} from '@ctws/contracts'
import { clockTime, zoneAbbreviation } from '@ctws/core'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import type { Queryable, Tx } from '../../platform/db/client'
import { groupBy } from '../../platform/values'
import { filing } from '../../shell/links/filing'
import { attendeesOf } from '../people'
import { MeetingNotFoundError, OccurrenceNotFoundError } from './errors'
import {
  type Exception,
  type LocalTime,
  localOf,
  type Occurrence,
  occurrencesIn,
} from './occurrences'
import { meetingExceptions, meetings } from './tables'
import { windowOf } from './zone'

type Attendee = { id: PersonId; name: string }

/** A row is a series: with its rule and exceptions it describes every occurrence. */
export type SeriesRow = typeof meetings.$inferSelect & {
  projectId: ProjectId | null
  projectName: string | null
  attendees: Attendee[]
  exceptions: Exception[]
}

/** One occurrence, with what a reader needs of its series. */
export type OccurrenceRow = Occurrence & {
  meetingId: MeetingId
  title: string
  rrule: string | null
  overridden: boolean
  location: string | null
  note: string | null
  projectId: ProjectId | null
  projectName: string | null
  attendees: Attendee[]
}

/** A live meeting in this workspace; every read and write goes through it. */
export function visibleMeetings(workspaceId: WorkspaceId) {
  return and(eq(meetings.workspaceId, workspaceId), isNull(meetings.deletedAt))
}

export const meetingFiling = filing('meeting', meetings)

/** A ceiling on series expanded per request, far above a personal calendar's month. */
const MAX_SERIES_PER_REQUEST = 500

type Selected = {
  meeting: typeof meetings.$inferSelect
  projectId: ProjectId | null
  projectName: string | null
}

/** Attaches attendees and exceptions to a page of series, one query each. */
async function hydrate(
  q: Queryable,
  workspaceId: WorkspaceId,
  rows: Selected[],
): Promise<SeriesRow[]> {
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.meeting.id)
  const [attending, found] = await Promise.all([
    attendeesOf(q, workspaceId, ids),
    q.select().from(meetingExceptions).where(inArray(meetingExceptions.meetingId, ids)),
  ])
  const exceptionsOf = groupBy(
    found,
    (e) => e.meetingId,
    (e): Exception => ({
      recurrenceId: e.recurrenceId,
      cancelled: e.cancelled,
      startsLocal: e.startsLocal,
      durationMinutes: e.durationMinutes,
    }),
  )
  return rows.map(({ meeting, projectId, projectName }) => ({
    ...meeting,
    projectId,
    projectName,
    attendees: attending.get(meeting.id) ?? [],
    exceptions: exceptionsOf.get(meeting.id) ?? [],
  }))
}

const asSeries = (s: SeriesRow) => ({
  startsLocal: s.startsLocal,
  timeZone: s.timeZone,
  durationMinutes: s.durationMinutes,
  rrule: s.rrule,
})

function expand(series: SeriesRow, window: { from: Date; to: Date }): OccurrenceRow[] {
  const overridden = new Set(
    series.exceptions.filter((e) => !e.cancelled).map((e) => e.recurrenceId),
  )
  return occurrencesIn(asSeries(series), series.exceptions, window).map((o) => ({
    ...o,
    meetingId: series.id,
    title: series.title,
    rrule: series.rrule,
    overridden: overridden.has(o.recurrenceId),
    location: series.location,
    note: series.note,
    projectId: series.projectId,
    projectName: series.projectName,
    attendees: series.attendees,
  }))
}

async function seriesOf(
  q: Queryable,
  workspaceId: WorkspaceId,
  id?: MeetingId,
): Promise<SeriesRow[]> {
  const rows = await q
    .select({ meeting: meetings, ...meetingFiling.project })
    .from(meetings)
    .where(and(visibleMeetings(workspaceId), id ? eq(meetings.id, id) : undefined))
    .orderBy(asc(meetings.startsLocal), asc(meetings.id))
    .limit(MAX_SERIES_PER_REQUEST)
  return hydrate(q, workspaceId, rows)
}

/** Locks a live meeting for the rest of the transaction, so an edit reads it only once it is held. */
export async function lockMeeting(q: Tx, workspaceId: WorkspaceId, id: MeetingId): Promise<void> {
  const [row] = await q
    .select({ id: meetings.id })
    .from(meetings)
    .where(and(visibleMeetings(workspaceId), eq(meetings.id, id)))
    .for('update')
  if (!row) throw new MeetingNotFoundError()
}

export async function seriesById(
  q: Queryable,
  workspaceId: WorkspaceId,
  id: MeetingId,
): Promise<SeriesRow> {
  const [series] = await seriesOf(q, workspaceId, id)
  if (!series) throw new MeetingNotFoundError()
  return series
}

/** Every occurrence between two instants, which is how events in many zones are compared. */
export async function listOccurrences(
  q: Queryable,
  workspaceId: WorkspaceId,
  window: { from: Date; to: Date },
): Promise<OccurrenceRow[]> {
  const series = await seriesOf(q, workspaceId)
  return series
    .flatMap((s) => expand(s, window))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
}

/** A window around a local time, wide enough for any zone. */
function around(recurrenceId: LocalTime): { from: Date; to: Date } {
  const at = Date.parse(`${recurrenceId}:00Z`)
  return { from: new Date(at - 2 * DAY_MS), to: new Date(at + 2 * DAY_MS) }
}

/** One occurrence by its series and recurrence id. */
export async function getOccurrence(
  q: Queryable,
  workspaceId: WorkspaceId,
  id: MeetingId,
  recurrenceId: LocalTime,
): Promise<OccurrenceRow> {
  const series = await seriesById(q, workspaceId, id)
  // Searched where it is now: an override can move it out of the days around its original slot.
  const at =
    series.exceptions.find((e) => e.recurrenceId === recurrenceId)?.startsLocal ?? recurrenceId
  const one = expand(series, around(at)).find((o) => o.recurrenceId === recurrenceId)
  if (!one) throw new OccurrenceNotFoundError()
  return one
}

/**
 * Only a recurrence id the rule produces names an occurrence. Exceptions are ignored, so a moved
 * or cancelled occurrence can still be edited again.
 */
export function assertOccurs(series: SeriesRow, recurrenceId: LocalTime): void {
  const found = occurrencesIn(asSeries(series), [], around(recurrenceId))
  if (!found.some((o) => o.recurrenceId === recurrenceId)) throw new OccurrenceNotFoundError()
}

/**
 * Occurrences for the shell's calendar, on the account's clock. A meeting in another zone also
 * carries its own time there.
 */
export async function meetingEntries(
  q: Queryable,
  workspaceId: WorkspaceId,
  range: { from: string; to: string },
  zone: string,
): Promise<CalendarEntry[]> {
  const rows = await listOccurrences(q, workspaceId, windowOf(range.from, range.to, zone))
  return rows.map((m) => {
    const elsewhere = m.timeZone !== zone
    return {
      id: occurrenceKey(m),
      day: localOf(m.startsAt, zone).slice(0, 10),
      title: m.title,
      to: '/calendar',
      kind: elsewhere
        ? `meeting · ${zoneAbbreviation(m.startsAt, m.timeZone)} ${localOf(m.startsAt, m.timeZone).slice(11)}`
        : 'Meetings',
      time: clockTime(m.startsAt, zone),
      endTime: clockTime(m.endsAt, zone),
      zone: elsewhere ? zoneAbbreviation(m.startsAt, m.timeZone) : null,
      projectId: m.projectId,
      projectName: m.projectName,
    }
  })
}
