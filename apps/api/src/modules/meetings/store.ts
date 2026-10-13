import type { CreateMeetingBody, EditScope, UpdateMeetingBody } from '@ctws/contracts'
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import { PersonNotFoundError } from '../people/errors'
import type { Queryable } from '../../platform/db/client'
import { people } from '../people/tables'
import { meetingExceptions, meetings } from './tables'
import { peopleLinkedFrom, filedUnder, oneProjectOf, putLinks } from '../../shell/links/store'
import { assertProjectVisible } from '../../shell/projects/store'
import {
  BadRuleError,
  MeetingNotFoundError,
  OccurrenceNotFoundError,
  OneOccurrenceLimitError,
} from './errors'
import {
  endedBefore,
  ruleProblem,
  occurrencesIn,
  type Exception,
  type LocalTime,
  type Occurrence,
} from './occurrences'

/**
 * MEETINGS' storage.
 *
 * A row here is a SERIES, not a meeting: one row plus its rule and its exceptions describes every
 * occurrence of it. Nothing below ever stores an instant -- `occurrences.ts` has the argument.
 *
 * It borrows the workspace and `visibleProjects` from the shell, and reads the PEOPLE table,
 * because `ATTENDEE` points at people and the address book is the list you pick them out of.
 */

type MeetingAttendee = { id: string; name: string }

type SeriesRow = typeof meetings.$inferSelect & {
  projectId: string | null
  projectName: string | null
  attendees: MeetingAttendee[]
  exceptions: Exception[]
}

/** One occurrence, with everything a reader needs about it and its series. */
export type OccurrenceRow = Occurrence & {
  meetingId: string
  title: string
  rrule: string | null
  overridden: boolean
  location: string | null
  note: string | null
  projectId: string | null
  projectName: string | null
  attendees: MeetingAttendee[]
}

const DAY = 86_400_000

/** THE TENANT CHOKEPOINT. Every read and write below goes through it. */
function visibleMeetings(workspaceId: string) {
  return and(eq(meetings.workspaceId, workspaceId), isNull(meetings.deletedAt))
}

// The project is an EDGE now, not a column: `oneProjectOf` is the shell's, and every module that
// shows one project reads it the same way.
const withProject = { meeting: meetings, ...oneProjectOf('meeting', 'meetings') }

type Selected = {
  meeting: typeof meetings.$inferSelect
  projectId: string | null
  projectName: string | null
}

/** Attaches attendees and exceptions, in ONE query each for the whole page. */
async function hydrate(q: Queryable, workspaceId: string, rows: Selected[]): Promise<SeriesRow[]> {
  const ids = rows.map((r) => r.meeting.id)
  let attending = new Map<string, MeetingAttendee[]>()
  const skips = new Map<string, Exception[]>()
  if (ids.length > 0) {
    const [guests, found] = await Promise.all([
      peopleLinkedFrom(q, workspaceId, 'meeting', ids, 'attends'),
      q.select().from(meetingExceptions).where(inArray(meetingExceptions.meetingId, ids)),
    ])
    attending = guests
    for (const e of found) {
      const one: Exception = {
        recurrenceId: e.recurrenceId,
        cancelled: e.cancelled,
        startsLocal: e.startsLocal,
        durationMinutes: e.durationMinutes,
      }
      const list = skips.get(e.meetingId)
      if (list) list.push(one)
      else skips.set(e.meetingId, [one])
    }
  }
  return rows.map(({ meeting, projectId, projectName }) => ({
    ...meeting,
    projectId,
    projectName,
    attendees: attending.get(meeting.id) ?? [],
    exceptions: skips.get(meeting.id) ?? [],
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

/** Every named person has to be one of THIS workspace's, and all of them or none. */
async function assertAttendees(
  q: Queryable,
  workspaceId: string,
  personIds: readonly string[],
): Promise<void> {
  if (personIds.length === 0) return
  const unique = [...new Set(personIds)]
  const rows = await q
    .select({ id: people.id })
    .from(people)
    .where(
      and(
        eq(people.workspaceId, workspaceId),
        isNull(people.deletedAt),
        inArray(people.id, unique),
      ),
    )
  if (rows.length !== unique.length) throw new PersonNotFoundError()
}

/**
 * HOW MANY SERIES ONE REQUEST WILL EXPAND.
 *
 * Expansion is bounded per series; the number of series was not, so a workspace with thousands of
 * meetings turned one calendar read into thousands of expansions. A month of a personal calendar
 * is tens of meetings, so this is far above any real page and still a ceiling.
 */
const MAX_SERIES_PER_REQUEST = 500

/** Every series of a workspace, hydrated. The expansion is the caller's, per window. */
async function seriesOf(
  q: Queryable,
  workspaceId: string,
  opts: { projectId?: string | undefined; id?: string | undefined } = {},
): Promise<SeriesRow[]> {
  const rows = await q
    .select(withProject)
    .from(meetings)
    .where(
      and(
        visibleMeetings(workspaceId),
        opts.projectId ? filedUnder('meeting', 'meetings', opts.projectId) : undefined,
        opts.id ? eq(meetings.id, opts.id) : undefined,
      ),
    )
    .orderBy(asc(meetings.startsLocal), asc(meetings.id))
    .limit(MAX_SERIES_PER_REQUEST)
  return hydrate(q, workspaceId, rows)
}

/**
 * Every occurrence in a window, across every series.
 *
 * The window arrives as INSTANTS: the caller turned the account's calendar days into them, which
 * is the only zone-free way to ask a question of events that each carry their own zone.
 */
export async function listOccurrences(
  q: Queryable,
  workspaceId: string,
  window: { from: Date; to: Date },
  opts: { projectId?: string | undefined } = {},
): Promise<OccurrenceRow[]> {
  const series = await seriesOf(q, workspaceId, opts)
  return series
    .flatMap((s) => expand(s, window))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
}

/** The window to search for one occurrence near a local time: that time, surrounded. */
function around(recurrenceId: LocalTime): { from: Date; to: Date } {
  const at = Date.parse(`${recurrenceId}:00Z`)
  return { from: new Date(at - 2 * DAY), to: new Date(at + 2 * DAY) }
}

/** One occurrence by its series and its recurrence id. */
export async function getOccurrence(
  q: Queryable,
  workspaceId: string,
  id: string,
  recurrenceId?: LocalTime,
): Promise<OccurrenceRow> {
  const [series] = await seriesOf(q, workspaceId, { id })
  if (!series) throw new MeetingNotFoundError()
  const want = recurrenceId ?? series.startsLocal
  // Searched for where it IS: an override can move Tuesday's meeting to Friday, out of the days
  // around Tuesday, and the expansion keeps only what overlaps the window it is asked about.
  const at = series.exceptions.find((e) => e.recurrenceId === want)?.startsLocal ?? want
  const one = expand(series, around(at)).find((o) => o.recurrenceId === want)
  if (!one) throw new OccurrenceNotFoundError()
  return one
}

/**
 * A recurrence id the RULE never produced names no occurrence, whatever it looks like.
 *
 * Checked without the exceptions: one that was already moved or cancelled is still an occurrence
 * of the rule, and editing it again has to be able to reach it.
 */
function assertOccurs(series: SeriesRow, recurrenceId: LocalTime): void {
  const found = occurrencesIn(asSeries(series), [], around(recurrenceId))
  if (!found.some((o) => o.recurrenceId === recurrenceId)) throw new OccurrenceNotFoundError()
}

export async function createMeeting(
  q: Queryable,
  workspaceId: string,
  body: CreateMeetingBody,
): Promise<OccurrenceRow> {
  if (body.projectId) await assertProjectVisible(q, workspaceId, body.projectId)
  await assertAttendees(q, workspaceId, body.attendeeIds ?? [])
  // The expander is what has to understand a rule, so it is what decides whether one is usable:
  // a schema that accepted what the expansion then ignored would store a schedule that never
  // happens.
  const wrong = body.rrule ? ruleProblem(body.rrule, body.startsLocal) : null
  if (wrong) throw new BadRuleError(wrong)

  const id = uuidv7()
  await q.insert(meetings).values({
    id,
    workspaceId,
    title: body.title,
    startsLocal: body.startsLocal,
    timeZone: body.timeZone,
    durationMinutes: body.durationMinutes,
    rrule: body.rrule ?? null,
    location: body.location ?? null,
    note: body.note ?? null,
  })
  await putLinks(
    q,
    workspaceId,
    { type: 'meeting', id },
    'person',
    'attends',
    body.attendeeIds ?? [],
  )
  await putLinks(
    q,
    workspaceId,
    { type: 'meeting', id },
    'project',
    'belongs',
    body.projectId ? [body.projectId] : [],
  )
  return getOccurrence(q, workspaceId, id, body.startsLocal)
}

export async function updateMeeting(
  q: Queryable,
  workspaceId: string,
  id: string,
  patch: UpdateMeetingBody,
): Promise<OccurrenceRow> {
  const [series] = await seriesOf(q, workspaceId, { id })
  if (!series) throw new MeetingNotFoundError()
  if (patch.projectId) await assertProjectVisible(q, workspaceId, patch.projectId)
  if (patch.attendeeIds) await assertAttendees(q, workspaceId, patch.attendeeIds)

  const { scope: asked, recurrenceId, attendeeIds, projectId, ...fields } = patch
  // A meeting that happens once has one occurrence, so the three scopes are the same thing.
  const scope: EditScope = series.rrule ? asked : 'all'

  /**
   * The rule is checked against the start it will have AFTER the edit, not alone: moving a
   * Monday series onto a Tuesday without its rule is the same mismatch as arranging one. One
   * occurrence carries no rule of its own, so `one` has nothing here to check.
   */
  if (scope !== 'one' && (fields.startsLocal !== undefined || fields.rrule !== undefined)) {
    const rule = fields.rrule !== undefined ? fields.rrule : series.rrule
    const startsLocal =
      fields.startsLocal ?? (scope === 'following' ? recurrenceId! : series.startsLocal)
    const wrong = rule ? ruleProblem(rule, startsLocal) : null
    if (wrong) throw new BadRuleError(wrong)
  }

  if (scope === 'one') {
    assertOccurs(series, recurrenceId!)
    /**
     * ONE OCCURRENCE: a `RECURRENCE-ID` override, and only of what can differ between two
     * occurrences of one series. A title, a place, a guest list and a project belong to the
     * SERIES -- moving one week's meeting is not a reason for it to have two titles.
     */
    const moved = {
      startsLocal: fields.startsLocal ?? null,
      durationMinutes: fields.durationMinutes ?? null,
    }
    const others = Object.keys(fields).filter((k) => k !== 'startsLocal' && k !== 'durationMinutes')
    if (others.length > 0 || attendeeIds || projectId !== undefined) {
      throw new OneOccurrenceLimitError()
    }
    if (moved.startsLocal === null && moved.durationMinutes === null) {
      throw new OneOccurrenceLimitError()
    }
    await q
      .insert(meetingExceptions)
      .values({ meetingId: id, recurrenceId: recurrenceId!, cancelled: false, ...moved })
      .onConflictDoUpdate({
        target: [meetingExceptions.meetingId, meetingExceptions.recurrenceId],
        set: { cancelled: false, ...moved },
      })
    await touch(q, workspaceId, id)
    return getOccurrence(q, workspaceId, id, recurrenceId!)
  }

  if (scope === 'following') {
    assertOccurs(series, recurrenceId!)
    /**
     * FROM HERE ON: the old series is stopped just before this occurrence and a new one starts at
     * it. RFC 5545 has no "change from here"; splitting is what every calendar does, and it
     * leaves the past exactly as it happened.
     */
    await q
      .update(meetings)
      .set({ rrule: endedBefore(series.rrule!, recurrenceId!), updatedAt: new Date() })
      .where(and(visibleMeetings(workspaceId), eq(meetings.id, id)))

    const newId = uuidv7()
    const startsLocal = fields.startsLocal ?? recurrenceId!
    await q.insert(meetings).values({
      id: newId,
      workspaceId,
      title: fields.title ?? series.title,
      startsLocal,
      timeZone: fields.timeZone ?? series.timeZone,
      durationMinutes: fields.durationMinutes ?? series.durationMinutes,
      rrule: 'rrule' in fields ? (fields.rrule ?? null) : series.rrule,
      location: 'location' in fields ? (fields.location ?? null) : series.location,
      note: 'note' in fields ? (fields.note ?? null) : series.note,
    })
    const carried = projectId !== undefined ? projectId : series.projectId
    await putLinks(
      q,
      workspaceId,
      { type: 'meeting', id: newId },
      'person',
      'attends',
      attendeeIds ?? series.attendees.map((p) => p.id),
    )
    await putLinks(
      q,
      workspaceId,
      { type: 'meeting', id: newId },
      'project',
      'belongs',
      carried ? [carried] : [],
    )
    // The overrides AT OR AFTER the split belong to the new series; the earlier ones stay with the
    // old one, because the past is still what happened.
    await q.execute(sql`
      update meeting_exceptions set meeting_id = ${newId}
      where meeting_id = ${id} and recurrence_id >= ${recurrenceId!}
    `)
    return getOccurrence(q, workspaceId, newId, startsLocal)
  }

  // THE WHOLE SERIES.
  await q
    .update(meetings)
    .set({ ...fields, updatedAt: new Date() })
    .where(and(visibleMeetings(workspaceId), eq(meetings.id, id)))
  if (attendeeIds) {
    await putLinks(q, workspaceId, { type: 'meeting', id }, 'person', 'attends', attendeeIds)
  }
  // `projectId: null` and an absent `projectId` are different answers: one unfiles the meeting,
  // the other leaves it where it is.
  if (projectId !== undefined) {
    await putLinks(
      q,
      workspaceId,
      { type: 'meeting', id },
      'project',
      'belongs',
      projectId ? [projectId] : [],
    )
  }
  /**
   * Moving the series' own start, or changing its rule, moves every occurrence -- so the overrides,
   * which are keyed by the OLD local times, no longer name anything. They are dropped rather than
   * left to haunt a schedule nobody can see them in.
   */
  if (fields.startsLocal !== undefined || fields.rrule !== undefined) {
    await q.delete(meetingExceptions).where(eq(meetingExceptions.meetingId, id))
  }
  const [after] = await seriesOf(q, workspaceId, { id })
  return getOccurrence(q, workspaceId, id, after!.startsLocal)
}

/** Cancels a whole series, or one occurrence of it (`EXDATE`), or everything from one on. */
export async function cancelMeeting(
  q: Queryable,
  workspaceId: string,
  id: string,
  opts: { scope: EditScope; recurrenceId?: LocalTime | undefined },
): Promise<void> {
  const [series] = await seriesOf(q, workspaceId, { id })
  if (!series) throw new MeetingNotFoundError()
  const scope: EditScope = series.rrule ? opts.scope : 'all'

  if (scope === 'one') {
    assertOccurs(series, opts.recurrenceId!)
    await q
      .insert(meetingExceptions)
      .values({
        meetingId: id,
        recurrenceId: opts.recurrenceId!,
        cancelled: true,
        startsLocal: null,
        durationMinutes: null,
      })
      .onConflictDoUpdate({
        target: [meetingExceptions.meetingId, meetingExceptions.recurrenceId],
        set: { cancelled: true, startsLocal: null, durationMinutes: null },
      })
    await touch(q, workspaceId, id)
    return
  }

  if (scope === 'following') {
    assertOccurs(series, opts.recurrenceId!)
    await q
      .update(meetings)
      .set({ rrule: endedBefore(series.rrule!, opts.recurrenceId!), updatedAt: new Date() })
      .where(and(visibleMeetings(workspaceId), eq(meetings.id, id)))
    await q.execute(sql`
      delete from meeting_exceptions
      where meeting_id = ${id} and recurrence_id >= ${opts.recurrenceId!}
    `)
    return
  }

  const deleted = await q
    .update(meetings)
    .set({ deletedAt: new Date() })
    .where(and(visibleMeetings(workspaceId), eq(meetings.id, id)))
    .returning({ id: meetings.id })
  if (deleted.length === 0) throw new MeetingNotFoundError()
}

const touch = (q: Queryable, workspaceId: string, id: string) =>
  q
    .update(meetings)
    .set({ updatedAt: new Date() })
    .where(and(visibleMeetings(workspaceId), eq(meetings.id, id)))
