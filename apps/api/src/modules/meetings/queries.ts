import {
  type CalendarEntry,
  DAY_MS,
  type MeetingId,
  type PersonId,
  type ProjectId,
  type WorkspaceId,
} from '@ctws/contracts'
import { and, asc, eq, gt, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Queryable, Tx } from '../../platform/db/client'
import { type LocalTime, localOf } from '../../platform/zone'
import { rowsOf } from '../../platform/db/raw'
import { scoped, within } from '../../platform/db/scope'
import { groupBy } from '../../platform/values'
import { projectNameSql } from '../../shell/projects'
import { type Exception, type Occurrence, occurrencesIn } from './occurrences'
import { meetingExceptions, meetings } from './tables'
import { windowOf } from './zone'
import { NotFound } from '../../platform/errors'
import { type Page, type PageAsked, pageOf, spanOf } from '../../platform/db/page'

type Attendee = { id: PersonId; name: string }

/** A row is a series: with its rule and exceptions it describes every occurrence. */
export type SeriesRow = typeof meetings.$inferSelect & {
  projectName: string | null
  attendees: Attendee[]
  exceptions: Exception[]
}

const attendeeRow = z.object({ meetingId: z.string(), id: z.string(), name: z.string() })

/** The live people in each meeting, by name as a page lists them. */
async function attendeesOf(
  q: Queryable,
  meetingIds: readonly MeetingId[],
): Promise<Map<string, Attendee[]>> {
  if (meetingIds.length === 0) return new Map()
  const result = await q.execute(sql`
    select a.meeting_id as "meetingId", p.id, p.name
    from meeting_attendees a
    join people p on p.id = a.person_id and p.deleted_at is null
    where a.meeting_id in (${sql.join(
      meetingIds.map((id) => sql`${id}`),
      sql`, `,
    )})
    order by a.meeting_id, p.name collate "C", p.id
  `)
  return groupBy(
    rowsOf(result, attendeeRow),
    (r) => r.meetingId,
    (r): Attendee => ({ id: r.id as PersonId, name: r.name }),
  )
}

/** One occurrence, with what a reader needs of its series. */
export type OccurrenceRow = Occurrence & {
  meetingId: MeetingId
  title: string
  rrule: string | null
  overridden: boolean
  location: string | null
  joinUrl: string | null
  note: string | null
  projectId: ProjectId | null
  projectName: string | null
  attendees: Attendee[]
}

type Selected = { meeting: typeof meetings.$inferSelect; projectName: string | null }

/** Attaches attendees and exceptions to a page of series, one query each. */
async function hydrate(q: Queryable, rows: Selected[]): Promise<SeriesRow[]> {
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.meeting.id)
  const [attending, found] = await Promise.all([
    attendeesOf(q, ids),
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
  // A deleted project is kept on the row for history, but the page names only a live one.
  return rows.map(({ meeting, projectName }) => ({
    ...meeting,
    projectId: projectName === null ? null : meeting.projectId,
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

function expand(series: SeriesRow, window: Window): OccurrenceRow[] {
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
    joinUrl: series.joinUrl,
    note: series.note,
    projectId: series.projectId,
    projectName: series.projectName,
    attendees: series.attendees,
  }))
}

type Window = { from: Date; to: Date }

/** Series whose span (see `seriesBounds`) meets the window: the only ones with an occurrence in it. */
const meets = (window: Window) =>
  and(
    lt(meetings.firstStartsAt, window.to),
    or(isNull(meetings.lastEndsAt), gt(meetings.lastEndsAt, window.from)),
  )

const selectSeries = (q: Queryable, workspaceId: WorkspaceId, which: MeetingId | Window) =>
  q
    .select({ meeting: meetings, projectName: projectNameSql(meetings.projectId) })
    .from(meetings)
    .where(
      within(
        scoped(meetings, workspaceId),
        typeof which === 'string' ? eq(meetings.id, which) : meets(which),
      ),
    )
    .orderBy(asc(meetings.startsLocal), asc(meetings.id))

/** A page of the series that meet a window, each to be expanded over it whole. */
async function seriesPage(
  q: Queryable,
  workspaceId: WorkspaceId,
  window: Window,
  asked: PageAsked,
): Promise<Page<SeriesRow>> {
  const span = spanOf(asked)
  const rows = await selectSeries(q, workspaceId, window).limit(span.limit).offset(span.offset)
  const { rows: page, ...info } = pageOf(rows, asked)
  return { rows: await hydrate(q, page), ...info }
}

/** One live series in this workspace. Missing, deleted and foreign ids all read as not found. */
export async function getMeeting(
  q: Queryable,
  workspaceId: WorkspaceId,
  id: MeetingId,
): Promise<SeriesRow> {
  const [series] = await hydrate(q, await selectSeries(q, workspaceId, id))
  if (!series) throw new NotFound('Meeting')
  return series
}

/** `getMeeting`, with the row locked first, so an edit reads the series only once it is held. */
export async function lockMeeting(
  tx: Tx,
  workspaceId: WorkspaceId,
  id: MeetingId,
): Promise<SeriesRow> {
  const [row] = await tx
    .select({ id: meetings.id })
    .from(meetings)
    .where(within(scoped(meetings, workspaceId), eq(meetings.id, id)))
    .for('update')
  if (!row) throw new NotFound('Meeting')
  return getMeeting(tx, workspaceId, id)
}

/**
 * Every occurrence between two instants of a page of series, which is how events in many zones
 * are compared. In time order within the page.
 */
export async function listOccurrences(
  q: Queryable,
  workspaceId: WorkspaceId,
  window: Window,
  asked: PageAsked,
): Promise<Page<OccurrenceRow>> {
  const { rows, page } = await seriesPage(q, workspaceId, window, asked)
  const occurrences = rows
    .flatMap((s) => expand(s, window))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
  return { rows: occurrences, page }
}

/**
 * One series' occurrences over a window, in time order or the reverse, a page at a time. Missing,
 * deleted and foreign ids all read as not found.
 */
export async function seriesOccurrences(
  q: Queryable,
  workspaceId: WorkspaceId,
  id: MeetingId,
  window: Window,
  order: 'asc' | 'desc',
  asked: PageAsked,
): Promise<Page<OccurrenceRow>> {
  const all = expand(await getMeeting(q, workspaceId, id), window)
  const { limit, offset } = spanOf(asked)
  return pageOf((order === 'asc' ? all : all.reverse()).slice(offset, offset + limit), asked)
}

/** A window around a local time, wide enough for any zone. */
function around(recurrenceId: LocalTime): Window {
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
  const series = await getMeeting(q, workspaceId, id)
  // Searched where it is now: an override can move it out of the days around its original slot.
  const at =
    series.exceptions.find((e) => e.recurrenceId === recurrenceId)?.startsLocal ?? recurrenceId
  const one = expand(series, around(at)).find((o) => o.recurrenceId === recurrenceId)
  if (!one) throw new NotFound('Occurrence')
  return one
}

/**
 * Only a recurrence id the rule produces names an occurrence. Exceptions are ignored, so a moved
 * or cancelled occurrence can still be edited again.
 */
export function assertOccurs(series: SeriesRow, recurrenceId: LocalTime): void {
  const found = occurrencesIn(asSeries(series), [], around(recurrenceId))
  if (!found.some((o) => o.recurrenceId === recurrenceId)) throw new NotFound('Occurrence')
}

/** Occurrences for the shell's calendar, each on the day it falls on in the account's zone. */
export async function meetingEntries(
  q: Queryable,
  workspaceId: WorkspaceId,
  range: { from: string; to: string },
  zone: string,
  asked: PageAsked,
): Promise<Page<CalendarEntry>> {
  const { rows, page } = await listOccurrences(
    q,
    workspaceId,
    windowOf(range.from, range.to, zone),
    asked,
  )
  const entries = rows.map((m): CalendarEntry => ({
    type: 'meeting',
    id: m.meetingId,
    kind: 'occurrence',
    recurrenceId: m.recurrenceId,
    day: localOf(m.startsAt, zone).slice(0, 10),
    title: m.title,
    startsAt: m.startsAt.toISOString(),
    endsAt: m.endsAt.toISOString(),
    timeZone: m.timeZone,
    turns: null,
    projectId: m.projectId,
    projectName: m.projectName,
  }))
  return { rows: entries, page }
}
