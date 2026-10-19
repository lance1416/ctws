import {
  type CreateMeetingBody,
  type SuccessorBody,
  type UpdateSeriesBody,
  type PersonId,
  type ProjectId,
  type WorkspaceId,
  type MeetingId,
  meetingId,
} from '@ctws/contracts'
import { newId } from '../../platform/db/ids'
import { eq, sql } from 'drizzle-orm'
import type { Db, Queryable, Tx } from '../../platform/db/client'
import { replaceRows } from '../../platform/db/replace'
import { type Actor, scoped, within } from '../../platform/db/scope'
import { eventLog } from '../../shell/events'
import { assertProjectsVisible } from '../../shell/projects'
import { assertPeopleVisible } from '../people'
import { BadRuleError, OnceOnlyError } from './errors'
import { endedBefore, type LocalTime, ruleProblem, type Series, seriesBounds } from './occurrences'
import {
  assertOccurs,
  getOccurrence,
  getMeeting,
  lockMeeting,
  type OccurrenceRow,
  type SeriesRow,
} from './queries'
import { meetingAttendees, meetingExceptions, meetings } from './tables'

const subject = (id: MeetingId) => ({ type: 'meeting' as const, id })

type Fields = Omit<UpdateSeriesBody, 'attendeeIds' | 'projectId'>

/** Which occurrences an edit or a cancel reaches. */
type Scope = 'one' | 'following' | 'all'

type Edit = {
  tx: Tx
  workspaceId: WorkspaceId
  now: Date
  series: SeriesRow
  fields: Fields
  recurrenceId: LocalTime | undefined
  attendeeIds: PersonId[] | undefined
  projectId: ProjectId | null | undefined
}

type Cancel = {
  tx: Tx
  workspaceId: WorkspaceId
  now: Date
  series: SeriesRow
  recurrenceId: LocalTime | undefined
}

/** Who is in the room, as a set. */
const putAttendees = (
  q: Tx,
  { id, attendeeIds }: { id: MeetingId; attendeeIds: readonly PersonId[] },
) =>
  replaceRows(
    q,
    meetingAttendees,
    eq(meetingAttendees.meetingId, id),
    [...new Set(attendeeIds)].map((personId) => ({ meetingId: id, personId })),
  )

const touch = (q: Queryable, { workspaceId, now }: Actor, id: MeetingId) =>
  q
    .update(meetings)
    .set({ updatedAt: now })
    .where(within(scoped(meetings, workspaceId), eq(meetings.id, id)))

/**
 * Stores the span a series' occurrences lie in, as it is after a write to the series or its
 * exceptions; every write ends with it, so a read of a window can trust the span to skip by.
 */
async function recomputeBounds(tx: Tx, id: MeetingId): Promise<void> {
  const [series] = await tx.select().from(meetings).where(eq(meetings.id, id))
  const exceptions = await tx
    .select()
    .from(meetingExceptions)
    .where(eq(meetingExceptions.meetingId, id))
  await tx.update(meetings).set(seriesBounds(series!, exceptions)).where(eq(meetings.id, id))
}

/** A new series' own columns, its span with them: it has no exceptions yet. */
const newSeries = <S extends Series>(series: S) => ({ ...series, ...seriesBounds(series, []) })

/** The expander decides whether a rule is usable, so a stored rule always happens. */
function assertRule(rule: string | null | undefined, startsLocal: LocalTime): void {
  const wrong = rule ? ruleProblem(rule, startsLocal) : null
  if (wrong) throw new BadRuleError(wrong)
}

/**
 * A changed start or rule is checked as the series will be after the edit; a single occurrence
 * has no rule of its own.
 */
function assertRuleFits(
  series: SeriesRow,
  scope: Exclude<Scope, 'one'>,
  patch: UpdateSeriesBody,
  from?: LocalTime,
): void {
  if (patch.startsLocal === undefined && patch.rrule === undefined) return
  const rule = patch.rrule !== undefined ? patch.rrule : series.rrule
  const startsLocal = patch.startsLocal ?? (scope === 'following' ? from! : series.startsLocal)
  assertRule(rule, startsLocal)
}

/**
 * One occurrence: an override of its start or length only. Title, place, guests and project
 * belong to the series.
 */
async function editOne({ tx, workspaceId, now, series, fields, recurrenceId }: Edit) {
  assertOccurs(series, recurrenceId!)
  // The body allows nothing else: title, place and guests are the series'. What it leaves out
  // keeps the override it already has.
  const { startsLocal, durationMinutes } = fields
  const moved = {
    ...(startsLocal !== undefined && { startsLocal }),
    ...(durationMinutes !== undefined && { durationMinutes }),
  }
  await tx
    .insert(meetingExceptions)
    .values({ meetingId: series.id, recurrenceId: recurrenceId!, cancelled: false, ...moved })
    .onConflictDoUpdate({
      target: [meetingExceptions.meetingId, meetingExceptions.recurrenceId],
      set: { cancelled: false, ...moved },
    })
  await touch(tx, { workspaceId, now }, series.id)
  return getOccurrence(tx, workspaceId, series.id, recurrenceId!)
}

/**
 * From one occurrence on: the series stops just before it and a new series starts at it, so the
 * past stays as it happened.
 */
async function editFollowing(e: Edit) {
  const { tx, workspaceId, now, series, fields, attendeeIds, projectId } = e
  const recurrenceId = e.recurrenceId!
  assertOccurs(series, recurrenceId)
  await tx
    .update(meetings)
    .set({ rrule: endedBefore(series.rrule!, recurrenceId), updatedAt: now })
    .where(within(scoped(meetings, workspaceId), eq(meetings.id, series.id)))

  const nextId = newId(meetingId)
  const startsLocal = fields.startsLocal ?? recurrenceId
  const rrule = 'rrule' in fields ? (fields.rrule ?? null) : series.rrule
  const carried = projectId !== undefined ? projectId : series.projectId
  await tx.insert(meetings).values({
    id: nextId,
    workspaceId,
    title: fields.title ?? series.title,
    ...newSeries({
      startsLocal,
      timeZone: fields.timeZone ?? series.timeZone,
      durationMinutes: fields.durationMinutes ?? series.durationMinutes,
      rrule,
    }),
    location: 'location' in fields ? (fields.location ?? null) : series.location,
    joinUrl: 'joinUrl' in fields ? (fields.joinUrl ?? null) : series.joinUrl,
    note: 'note' in fields ? (fields.note ?? null) : series.note,
    projectId: carried,
    createdAt: now,
    updatedAt: now,
  })
  await putAttendees(tx, {
    id: nextId,
    attendeeIds: attendeeIds ?? series.attendees.map((p) => p.id),
  })
  await eventLog(tx, { workspaceId, now }).append(subject(nextId), 'created', {
    to: { title: fields.title ?? series.title, continuedFrom: series.id, from: recurrenceId },
  })
  // Notes on occurrences from the split on hang on the new series (RFC-001 2.7).
  await tx.execute(sql`
    update notes set anchor_id = ${nextId}
    where anchor_type = 'meeting' and anchor_id = ${series.id}
      and occurrence_id is not null and occurrence_id >= ${recurrenceId}
  `)
  // Overrides from the split on are keyed by the old series' local times. The new series makes
  // the same ones only when it starts where the split is and keeps the rule; otherwise they would
  // name occurrences it never makes, so they go, as in `editAll`.
  const same = startsLocal === recurrenceId && rrule === series.rrule
  await tx.execute(
    same
      ? sql`
          update meeting_exceptions set meeting_id = ${nextId}
          where meeting_id = ${series.id} and recurrence_id >= ${recurrenceId}
        `
      : sql`
          delete from meeting_exceptions
          where meeting_id = ${series.id} and recurrence_id >= ${recurrenceId}
        `,
  )
  await recomputeBounds(tx, nextId)
  return getOccurrence(tx, workspaceId, nextId, startsLocal)
}

async function editAll({ tx, workspaceId, now, series, fields, attendeeIds, projectId }: Edit) {
  const log = eventLog(tx, { workspaceId, now })
  for (const field of [
    'title',
    'startsLocal',
    'timeZone',
    'durationMinutes',
    'rrule',
    'location',
    'joinUrl',
  ] as const) {
    const next = fields[field]
    if (next !== undefined && next !== series[field]) {
      await log.append(subject(series.id), 'field_changed', {
        field,
        from: series[field],
        to: next,
      })
    }
  }
  if (projectId !== undefined && projectId !== series.projectId) {
    await log.append(subject(series.id), 'field_changed', {
      field: 'projectId',
      from: series.projectId,
      to: projectId,
    })
  }
  await tx
    .update(meetings)
    // `null` unfiles the meeting; absent leaves it where it is.
    .set({ ...fields, ...(projectId !== undefined ? { projectId } : {}), updatedAt: now })
    .where(within(scoped(meetings, workspaceId), eq(meetings.id, series.id)))
  if (attendeeIds) {
    await putAttendees(tx, { id: series.id, attendeeIds })
    await log.append(subject(series.id), 'field_changed', {
      field: 'attendees',
      from: series.attendees.map((a) => a.id),
      to: attendeeIds,
    })
  }
  // Overrides are keyed by the old local times, which a new start or rule no longer produces.
  if (fields.startsLocal !== undefined || fields.rrule !== undefined) {
    await tx.delete(meetingExceptions).where(eq(meetingExceptions.meetingId, series.id))
  }
}

/** One occurrence, as an `EXDATE`. */
async function cancelOne({ tx, workspaceId, now, series, recurrenceId }: Cancel) {
  assertOccurs(series, recurrenceId!)
  const cancelled = { cancelled: true, startsLocal: null, durationMinutes: null }
  await tx
    .insert(meetingExceptions)
    .values({ meetingId: series.id, recurrenceId: recurrenceId!, ...cancelled })
    .onConflictDoUpdate({
      target: [meetingExceptions.meetingId, meetingExceptions.recurrenceId],
      set: cancelled,
    })
  await touch(tx, { workspaceId, now }, series.id)
}

async function cancelFollowing(c: Cancel) {
  const { tx, workspaceId, now, series, recurrenceId } = c
  assertOccurs(series, recurrenceId!)
  // From the first occurrence on is all of it: ending the rule there leaves a series that never
  // happens.
  if (recurrenceId === series.startsLocal) return cancelAll(c)
  await tx
    .update(meetings)
    .set({ rrule: endedBefore(series.rrule!, recurrenceId!), updatedAt: now })
    .where(within(scoped(meetings, workspaceId), eq(meetings.id, series.id)))
  await tx.execute(sql`
    delete from meeting_exceptions
    where meeting_id = ${series.id} and recurrence_id >= ${recurrenceId!}
  `)
}

async function cancelAll({ tx, workspaceId, now, series }: Cancel) {
  await tx
    .update(meetings)
    .set({ deletedAt: now })
    .where(within(scoped(meetings, workspaceId), eq(meetings.id, series.id)))
  await eventLog(tx, { workspaceId, now }).append(subject(series.id), 'deleted', {})
}

export async function createMeeting(
  db: Db,
  { workspaceId, now }: Actor,
  body: CreateMeetingBody,
): Promise<OccurrenceRow> {
  return db.transaction(async (tx) => {
    if (body.projectId) await assertProjectsVisible(tx, workspaceId, [body.projectId])
    await assertPeopleVisible(tx, workspaceId, body.attendeeIds ?? [])
    assertRule(body.rrule, body.startsLocal)
    const id = newId(meetingId)
    await tx.insert(meetings).values({
      id,
      workspaceId,
      title: body.title,
      ...newSeries({
        startsLocal: body.startsLocal,
        timeZone: body.timeZone,
        durationMinutes: body.durationMinutes,
        rrule: body.rrule ?? null,
      }),
      location: body.location ?? null,
      joinUrl: body.joinUrl ?? null,
      note: body.note ?? null,
      projectId: body.projectId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    await putAttendees(tx, { id, attendeeIds: body.attendeeIds ?? [] })
    await eventLog(tx, { workspaceId, now }).append(subject(id), 'created', {
      to: { title: body.title, startsLocal: body.startsLocal, projectId: body.projectId ?? null },
    })
    return getOccurrence(tx, workspaceId, id, body.startsLocal)
  })
}

/** What an edit names besides the meeting's own fields must be in the workspace. */
async function assertVisible(tx: Tx, workspaceId: WorkspaceId, patch: UpdateSeriesBody) {
  if (patch.projectId) await assertProjectsVisible(tx, workspaceId, [patch.projectId])
  if (patch.attendeeIds) await assertPeopleVisible(tx, workspaceId, patch.attendeeIds)
}

/** Changes the whole series. */
export async function updateSeries(
  db: Db,
  { workspaceId, now }: Actor,
  id: MeetingId,
  patch: UpdateSeriesBody,
): Promise<SeriesRow> {
  return db.transaction(async (tx) => {
    const series = await lockMeeting(tx, workspaceId, id)
    await assertVisible(tx, workspaceId, patch)
    assertRuleFits(series, 'all', patch)
    const { attendeeIds, projectId, ...fields } = patch
    const edit = { tx, workspaceId, now, series, fields, attendeeIds, projectId }
    await editAll({ ...edit, recurrenceId: undefined })
    await recomputeBounds(tx, id)
    return getMeeting(tx, workspaceId, id)
  })
}

/**
 * Moves one occurrence or changes its length. A meeting that happens once has one occurrence, so
 * moving it is moving the meeting.
 */
export async function updateOccurrence(
  db: Db,
  { workspaceId, now }: Actor,
  id: MeetingId,
  recurrenceId: LocalTime,
  fields: Pick<Fields, 'startsLocal' | 'durationMinutes'>,
): Promise<OccurrenceRow> {
  return db.transaction(async (tx) => {
    const series = await lockMeeting(tx, workspaceId, id)
    const edit = { tx, workspaceId, now, series, fields, recurrenceId }
    if (series.rrule) {
      const moved = await editOne({ ...edit, attendeeIds: undefined, projectId: undefined })
      await recomputeBounds(tx, id)
      return moved
    }
    assertOccurs(series, recurrenceId)
    assertRuleFits(series, 'all', fields)
    await editAll({ ...edit, attendeeIds: undefined, projectId: undefined })
    await recomputeBounds(tx, id)
    const after = await getMeeting(tx, workspaceId, id)
    return getOccurrence(tx, workspaceId, id, after.startsLocal)
  })
}

/**
 * Changes a series from one occurrence on, as a new series that takes over there. A meeting that
 * happens once has nothing after its occurrence to change.
 */
export async function continueSeries(
  db: Db,
  { workspaceId, now }: Actor,
  id: MeetingId,
  { from, ...patch }: SuccessorBody,
): Promise<OccurrenceRow> {
  return db.transaction(async (tx) => {
    const series = await lockMeeting(tx, workspaceId, id)
    if (!series.rrule) throw new OnceOnlyError()
    await assertVisible(tx, workspaceId, patch)
    assertRuleFits(series, 'following', patch, from)
    const { attendeeIds, projectId, ...fields } = patch
    const edit = {
      tx,
      workspaceId,
      now,
      series,
      fields,
      recurrenceId: from,
      attendeeIds,
      projectId,
    }
    // From the first occurrence on is the whole series, changed where it is: a split there would
    // leave the old one with nothing left to happen.
    if (from !== series.startsLocal) {
      const next = await editFollowing(edit)
      await recomputeBounds(tx, id)
      return next
    }
    assertOccurs(series, from)
    await editAll(edit)
    await recomputeBounds(tx, id)
    return getOccurrence(tx, workspaceId, id, fields.startsLocal ?? from)
  })
}

const CANCELS: Record<Scope, (c: Cancel) => Promise<void>> = {
  one: cancelOne,
  following: cancelFollowing,
  all: cancelAll,
}

/**
 * Cancels a whole series, one occurrence of it, or everything from one on. A meeting that happens
 * once is cancelled whole, whichever of its occurrences is named: it has only the one.
 */
export async function cancelMeeting(
  db: Db,
  { workspaceId, now }: Actor,
  id: MeetingId,
  scope: Scope,
  recurrenceId?: LocalTime,
): Promise<void> {
  await db.transaction(async (tx) => {
    const series = await lockMeeting(tx, workspaceId, id)
    if (recurrenceId !== undefined && !series.rrule) assertOccurs(series, recurrenceId)
    const reach = series.rrule ? scope : 'all'
    await CANCELS[reach]({ tx, workspaceId, now, series, recurrenceId })
    await recomputeBounds(tx, id)
  })
}
