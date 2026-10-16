import type { CreateMeetingBody, EditScope, UpdateMeetingBody } from '@ctws/contracts'
import { and, eq, sql } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import type { Db, Queryable } from '../../platform/db/client'
import { putLinks } from '../../shell/links/store'
import { assertProjectsVisible } from '../../shell/projects/queries'
import { assertPeopleVisible } from '../people'
import { BadRuleError, MeetingNotFoundError, OneOccurrenceLimitError } from './errors'
import { endedBefore, type LocalTime, ruleProblem } from './occurrences'
import {
  assertOccurs,
  getOccurrence,
  lockMeeting,
  meetingFiling,
  type OccurrenceRow,
  type SeriesRow,
  seriesById,
  visibleMeetings,
} from './queries'
import { meetingExceptions, meetings } from './tables'

type Fields = Omit<UpdateMeetingBody, 'scope' | 'recurrenceId' | 'attendeeIds' | 'projectId'>

type Edit = {
  tx: Queryable
  workspaceId: string
  series: SeriesRow
  fields: Fields
  recurrenceId: LocalTime | undefined
  attendeeIds: string[] | undefined
  projectId: string | null | undefined
}

type Cancel = {
  tx: Queryable
  workspaceId: string
  series: SeriesRow
  recurrenceId: LocalTime | undefined
}

const putAttendees = (q: Queryable, workspaceId: string, id: string, ids: readonly string[]) =>
  putLinks(q, workspaceId, { type: 'meeting', id }, 'person', 'attends', ids)

const touch = (q: Queryable, workspaceId: string, id: string) =>
  q
    .update(meetings)
    .set({ updatedAt: sql`now()` })
    .where(and(visibleMeetings(workspaceId), eq(meetings.id, id)))

/** The expander decides whether a rule is usable, so a stored rule always happens. */
function assertRule(rule: string | null | undefined, startsLocal: LocalTime): void {
  const wrong = rule ? ruleProblem(rule, startsLocal) : null
  if (wrong) throw new BadRuleError(wrong)
}

/**
 * A changed start or rule is checked as the series will be after the edit; a single occurrence
 * has no rule of its own.
 */
function assertRuleFits(series: SeriesRow, scope: EditScope, patch: UpdateMeetingBody): void {
  if (scope === 'one' || (patch.startsLocal === undefined && patch.rrule === undefined)) return
  const rule = patch.rrule !== undefined ? patch.rrule : series.rrule
  const startsLocal =
    patch.startsLocal ?? (scope === 'following' ? patch.recurrenceId! : series.startsLocal)
  assertRule(rule, startsLocal)
}

/**
 * One occurrence: an override of its start or length only. Title, place, guests and project
 * belong to the series.
 */
async function editOne({ tx, workspaceId, series, fields, recurrenceId, ...rest }: Edit) {
  assertOccurs(series, recurrenceId!)
  const moved = {
    startsLocal: fields.startsLocal ?? null,
    durationMinutes: fields.durationMinutes ?? null,
  }
  const others = Object.keys(fields).filter((k) => k !== 'startsLocal' && k !== 'durationMinutes')
  if (others.length > 0 || rest.attendeeIds || rest.projectId !== undefined) {
    throw new OneOccurrenceLimitError()
  }
  if (moved.startsLocal === null && moved.durationMinutes === null) {
    throw new OneOccurrenceLimitError()
  }
  await tx
    .insert(meetingExceptions)
    .values({ meetingId: series.id, recurrenceId: recurrenceId!, cancelled: false, ...moved })
    .onConflictDoUpdate({
      target: [meetingExceptions.meetingId, meetingExceptions.recurrenceId],
      set: { cancelled: false, ...moved },
    })
  await touch(tx, workspaceId, series.id)
  return getOccurrence(tx, workspaceId, series.id, recurrenceId!)
}

/**
 * From one occurrence on: the series stops just before it and a new series starts at it, so the
 * past stays as it happened.
 */
async function editFollowing(e: Edit) {
  const { tx, workspaceId, series, fields, attendeeIds, projectId } = e
  const recurrenceId = e.recurrenceId!
  assertOccurs(series, recurrenceId)
  await tx
    .update(meetings)
    .set({ rrule: endedBefore(series.rrule!, recurrenceId), updatedAt: sql`now()` })
    .where(and(visibleMeetings(workspaceId), eq(meetings.id, series.id)))

  const newId = uuidv7()
  const startsLocal = fields.startsLocal ?? recurrenceId
  const rrule = 'rrule' in fields ? (fields.rrule ?? null) : series.rrule
  await tx.insert(meetings).values({
    id: newId,
    workspaceId,
    title: fields.title ?? series.title,
    startsLocal,
    timeZone: fields.timeZone ?? series.timeZone,
    durationMinutes: fields.durationMinutes ?? series.durationMinutes,
    rrule,
    location: 'location' in fields ? (fields.location ?? null) : series.location,
    note: 'note' in fields ? (fields.note ?? null) : series.note,
  })
  const carried = projectId !== undefined ? projectId : series.projectId
  await putAttendees(tx, workspaceId, newId, attendeeIds ?? series.attendees.map((p) => p.id))
  await meetingFiling.put(tx, workspaceId, newId, carried ? [carried] : [])
  // Overrides from the split on are keyed by the old series' local times. The new series makes
  // the same ones only when it starts where the split is and keeps the rule; otherwise they would
  // name occurrences it never makes, so they go, as in `editAll`.
  const same = startsLocal === recurrenceId && rrule === series.rrule
  await tx.execute(
    same
      ? sql`
          update meeting_exceptions set meeting_id = ${newId}
          where meeting_id = ${series.id} and recurrence_id >= ${recurrenceId}
        `
      : sql`
          delete from meeting_exceptions
          where meeting_id = ${series.id} and recurrence_id >= ${recurrenceId}
        `,
  )
  return getOccurrence(tx, workspaceId, newId, startsLocal)
}

async function editAll({ tx, workspaceId, series, fields, attendeeIds, projectId }: Edit) {
  await tx
    .update(meetings)
    .set({ ...fields, updatedAt: sql`now()` })
    .where(and(visibleMeetings(workspaceId), eq(meetings.id, series.id)))
  if (attendeeIds) await putAttendees(tx, workspaceId, series.id, attendeeIds)
  // `null` unfiles the meeting; absent leaves it where it is.
  if (projectId !== undefined) {
    await meetingFiling.put(tx, workspaceId, series.id, projectId ? [projectId] : [])
  }
  // Overrides are keyed by the old local times, which a new start or rule no longer produces.
  if (fields.startsLocal !== undefined || fields.rrule !== undefined) {
    await tx.delete(meetingExceptions).where(eq(meetingExceptions.meetingId, series.id))
  }
  const after = await seriesById(tx, workspaceId, series.id)
  return getOccurrence(tx, workspaceId, series.id, after.startsLocal)
}

/** One occurrence, as an `EXDATE`. */
async function cancelOne({ tx, workspaceId, series, recurrenceId }: Cancel) {
  assertOccurs(series, recurrenceId!)
  const cancelled = { cancelled: true, startsLocal: null, durationMinutes: null }
  await tx
    .insert(meetingExceptions)
    .values({ meetingId: series.id, recurrenceId: recurrenceId!, ...cancelled })
    .onConflictDoUpdate({
      target: [meetingExceptions.meetingId, meetingExceptions.recurrenceId],
      set: cancelled,
    })
  await touch(tx, workspaceId, series.id)
}

async function cancelFollowing({ tx, workspaceId, series, recurrenceId }: Cancel) {
  assertOccurs(series, recurrenceId!)
  await tx
    .update(meetings)
    .set({ rrule: endedBefore(series.rrule!, recurrenceId!), updatedAt: sql`now()` })
    .where(and(visibleMeetings(workspaceId), eq(meetings.id, series.id)))
  await tx.execute(sql`
    delete from meeting_exceptions
    where meeting_id = ${series.id} and recurrence_id >= ${recurrenceId!}
  `)
}

async function cancelAll({ tx, workspaceId, series }: Cancel) {
  const deleted = await tx
    .update(meetings)
    .set({ deletedAt: sql`now()` })
    .where(and(visibleMeetings(workspaceId), eq(meetings.id, series.id)))
    .returning({ id: meetings.id })
  if (deleted.length === 0) throw new MeetingNotFoundError()
}

const EDITS: Record<EditScope, (e: Edit) => Promise<OccurrenceRow>> = {
  one: editOne,
  following: editFollowing,
  all: editAll,
}

const CANCELS: Record<EditScope, (c: Cancel) => Promise<void>> = {
  one: cancelOne,
  following: cancelFollowing,
  all: cancelAll,
}

/** A one-off meeting has one occurrence, so every scope means all of it. */
const scopeFor = (series: SeriesRow, asked: EditScope): EditScope => (series.rrule ? asked : 'all')

export async function createMeeting(
  db: Db,
  workspaceId: string,
  body: CreateMeetingBody,
): Promise<OccurrenceRow> {
  return db.transaction(async (tx) => {
    if (body.projectId) await assertProjectsVisible(tx, workspaceId, [body.projectId])
    await assertPeopleVisible(tx, workspaceId, body.attendeeIds ?? [])
    assertRule(body.rrule, body.startsLocal)
    const id = uuidv7()
    await tx.insert(meetings).values({
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
    await putAttendees(tx, workspaceId, id, body.attendeeIds ?? [])
    await meetingFiling.put(tx, workspaceId, id, body.projectId ? [body.projectId] : [])
    return getOccurrence(tx, workspaceId, id, body.startsLocal)
  })
}

export async function updateMeeting(
  db: Db,
  workspaceId: string,
  id: string,
  patch: UpdateMeetingBody,
): Promise<OccurrenceRow> {
  return db.transaction(async (tx) => {
    await lockMeeting(tx, workspaceId, id)
    const series = await seriesById(tx, workspaceId, id)
    if (patch.projectId) await assertProjectsVisible(tx, workspaceId, [patch.projectId])
    if (patch.attendeeIds) await assertPeopleVisible(tx, workspaceId, patch.attendeeIds)
    const scope = scopeFor(series, patch.scope)
    assertRuleFits(series, scope, patch)
    const { scope: _, recurrenceId, attendeeIds, projectId, ...fields } = patch
    return EDITS[scope]({ tx, workspaceId, series, fields, recurrenceId, attendeeIds, projectId })
  })
}

/** Cancels a whole series, one occurrence of it, or everything from one on. */
export async function cancelMeeting(
  db: Db,
  workspaceId: string,
  id: string,
  opts: { scope: EditScope; recurrenceId?: LocalTime | undefined },
): Promise<void> {
  await db.transaction(async (tx) => {
    await lockMeeting(tx, workspaceId, id)
    const series = await seriesById(tx, workspaceId, id)
    const scope = scopeFor(series, opts.scope)
    await CANCELS[scope]({ tx, workspaceId, series, recurrenceId: opts.recurrenceId })
  })
}
