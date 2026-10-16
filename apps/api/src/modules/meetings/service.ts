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
import { type Actor, scoped, within } from '../../platform/db/scope'
import { putLinks } from '../../shell/links'
import { assertProjectsVisible } from '../../shell/projects'
import { assertPeopleVisible } from '../people'
import { BadRuleError, OnceOnlyError } from './errors'
import { endedBefore, type LocalTime, ruleProblem } from './occurrences'
import {
  assertOccurs,
  getOccurrence,
  getMeeting,
  lockMeeting,
  meetingFiling,
  type OccurrenceRow,
  type SeriesRow,
} from './queries'
import { meetingExceptions, meetings } from './tables'

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

const putAttendees = (
  q: Tx,
  {
    workspaceId,
    now,
    id,
    attendeeIds,
  }: Actor & { id: MeetingId; attendeeIds: readonly PersonId[] },
) =>
  putLinks(q, {
    workspaceId,
    now,
    from: { type: 'meeting', id },
    toType: 'person',
    kind: 'attends',
    toIds: attendeeIds,
  })

const touch = (q: Queryable, { workspaceId, now }: Actor, id: MeetingId) =>
  q
    .update(meetings)
    .set({ updatedAt: now })
    .where(within(scoped(meetings, workspaceId), eq(meetings.id, id)))

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
  await tx.insert(meetings).values({
    id: nextId,
    workspaceId,
    title: fields.title ?? series.title,
    startsLocal,
    timeZone: fields.timeZone ?? series.timeZone,
    durationMinutes: fields.durationMinutes ?? series.durationMinutes,
    rrule,
    location: 'location' in fields ? (fields.location ?? null) : series.location,
    note: 'note' in fields ? (fields.note ?? null) : series.note,
    createdAt: now,
    updatedAt: now,
  })
  const carried = projectId !== undefined ? projectId : series.projectId
  await putAttendees(tx, {
    workspaceId,
    now,
    id: nextId,
    attendeeIds: attendeeIds ?? series.attendees.map((p) => p.id),
  })
  await meetingFiling.put(tx, {
    workspaceId,
    now,
    id: nextId,
    projectIds: carried ? [carried] : [],
  })
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
  return getOccurrence(tx, workspaceId, nextId, startsLocal)
}

async function editAll({ tx, workspaceId, now, series, fields, attendeeIds, projectId }: Edit) {
  await tx
    .update(meetings)
    .set({ ...fields, updatedAt: now })
    .where(within(scoped(meetings, workspaceId), eq(meetings.id, series.id)))
  if (attendeeIds) await putAttendees(tx, { workspaceId, now, id: series.id, attendeeIds })
  // `null` unfiles the meeting; absent leaves it where it is.
  if (projectId !== undefined) {
    await meetingFiling.put(tx, {
      workspaceId,
      now,
      id: series.id,
      projectIds: projectId ? [projectId] : [],
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
      startsLocal: body.startsLocal,
      timeZone: body.timeZone,
      durationMinutes: body.durationMinutes,
      rrule: body.rrule ?? null,
      location: body.location ?? null,
      note: body.note ?? null,
      createdAt: now,
      updatedAt: now,
    })
    await putAttendees(tx, { workspaceId, now, id, attendeeIds: body.attendeeIds ?? [] })
    await meetingFiling.put(tx, {
      workspaceId,
      now,
      id,
      projectIds: body.projectId ? [body.projectId] : [],
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
      return editOne({ ...edit, attendeeIds: undefined, projectId: undefined })
    }
    assertOccurs(series, recurrenceId)
    assertRuleFits(series, 'all', fields)
    await editAll({ ...edit, attendeeIds: undefined, projectId: undefined })
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
    if (from !== series.startsLocal) return editFollowing(edit)
    assertOccurs(series, from)
    await editAll(edit)
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
  })
}
