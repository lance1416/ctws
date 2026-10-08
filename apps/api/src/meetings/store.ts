import type { CreateMeetingBody, UpdateMeetingBody } from '@ctws/contracts'
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import type { Queryable } from '../db/client'
import { contacts, meetingAttendees, meetings, projects } from '../db/schema'
import { ContactNotFoundError } from '../contacts/errors'
import { ProjectNotFoundError } from '../projects/errors'
import { visibleProjects } from '../projects/store'
import { BackwardsMeetingError, MeetingNotFoundError } from './errors'

/**
 * 会议's storage, on iCalendar's `VEVENT`.
 *
 * It borrows the workspace and `visibleProjects` from the shell, and -- uniquely among the
 * modules so far -- it reads the CONTACTS table, because `ATTENDEE` points at people and the
 * address book is the list you pick them out of. That is a real coupling and it is written down
 * here rather than hidden behind a copy of the names.
 */

export type MeetingAttendee = { id: string; name: string }

export type MeetingRow = {
  id: string
  title: string
  startsAt: Date
  endsAt: Date
  location: string | null
  note: string | null
  projectId: string | null
  projectName: string | null
  attendees: MeetingAttendee[]
  createdAt: Date
  updatedAt: Date
}

/** THE TENANT CHOKEPOINT. Every read and write below goes through it. */
function visibleMeetings(workspaceId: string) {
  return and(eq(meetings.workspaceId, workspaceId), isNull(meetings.deletedAt))
}

type Selected = {
  meeting: typeof meetings.$inferSelect
  projectId: string | null
  projectName: string | null
}

// Both halves of the project come from one subquery, so a meeting never reports a project the
// person cannot see: projects are SOFT-deleted, so the column's ON DELETE SET NULL never fires.
const withProject = {
  meeting: meetings,
  projectId: sql<string | null>`(
    select p.id from projects p where p.id = meetings.project_id and p.deleted_at is null
  )`,
  projectName: sql<string | null>`(
    select p.name from projects p where p.id = meetings.project_id and p.deleted_at is null
  )`,
}

/** Attaches each meeting's attendees, in ONE query for the whole page. */
async function hydrate(q: Queryable, rows: Selected[]): Promise<MeetingRow[]> {
  const ids = rows.map((r) => r.meeting.id)
  const byMeeting = new Map<string, MeetingAttendee[]>()
  if (ids.length > 0) {
    const found = await q
      .select({ meetingId: meetingAttendees.meetingId, id: contacts.id, name: contacts.name })
      .from(meetingAttendees)
      .innerJoin(contacts, eq(contacts.id, meetingAttendees.contactId))
      // A person deleted since the meeting was arranged is left out rather than named: the
      // address book is where a name comes from, and a name nobody can look up is not one.
      .where(and(inArray(meetingAttendees.meetingId, ids), isNull(contacts.deletedAt)))
      .orderBy(asc(contacts.name), asc(contacts.id))
    for (const row of found) {
      const person = { id: row.id, name: row.name }
      const list = byMeeting.get(row.meetingId)
      if (list) list.push(person)
      else byMeeting.set(row.meetingId, [person])
    }
  }
  return rows.map(({ meeting, projectId, projectName }) => ({
    id: meeting.id,
    title: meeting.title,
    startsAt: meeting.startsAt,
    endsAt: meeting.endsAt,
    location: meeting.location,
    note: meeting.note,
    projectId,
    projectName,
    attendees: byMeeting.get(meeting.id) ?? [],
    createdAt: meeting.createdAt,
    updatedAt: meeting.updatedAt,
  }))
}

async function assertProject(q: Queryable, workspaceId: string, projectId: string): Promise<void> {
  const rows = await q
    .select({ id: projects.id })
    .from(projects)
    .where(and(visibleProjects(workspaceId), eq(projects.id, projectId)))
  if (rows.length === 0) throw new ProjectNotFoundError()
}

/** Every named person has to be one of THIS workspace's, and all of them or none. */
async function assertAttendees(
  q: Queryable,
  workspaceId: string,
  contactIds: readonly string[],
): Promise<void> {
  if (contactIds.length === 0) return
  const unique = [...new Set(contactIds)]
  const rows = await q
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(
        eq(contacts.workspaceId, workspaceId),
        isNull(contacts.deletedAt),
        inArray(contacts.id, unique),
      ),
    )
  if (rows.length !== unique.length) throw new ContactNotFoundError()
}

/** Replaces the whole guest list. Called inside the caller's transaction. */
async function putAttendees(
  q: Queryable,
  meetingId: string,
  contactIds: readonly string[],
): Promise<void> {
  await q.delete(meetingAttendees).where(eq(meetingAttendees.meetingId, meetingId))
  const unique = [...new Set(contactIds)]
  if (unique.length === 0) return
  await q.insert(meetingAttendees).values(unique.map((contactId) => ({ meetingId, contactId })))
}

export async function listMeetings(
  q: Queryable,
  workspaceId: string,
  timezone: string,
  opts: { projectId?: string | undefined; from?: string | undefined; to?: string | undefined } = {},
): Promise<MeetingRow[]> {
  const rows = await q
    .select(withProject)
    .from(meetings)
    .where(
      and(
        visibleMeetings(workspaceId),
        opts.projectId ? eq(meetings.projectId, opts.projectId) : undefined,
        // The WINDOW is in calendar days in the ACCOUNT's zone, so asking for 「这周」 means the
        // person's week and not the server's.
        opts.from
          ? sql`(${meetings.startsAt} at time zone ${timezone})::date >= ${opts.from}::date`
          : undefined,
        opts.to
          ? sql`(${meetings.startsAt} at time zone ${timezone})::date <= ${opts.to}::date`
          : undefined,
      ),
    )
    // Earliest first: a list of meetings is read forwards, unlike a reading pile.
    .orderBy(asc(meetings.startsAt), asc(meetings.id))
  return hydrate(q, rows)
}

export async function getMeeting(
  q: Queryable,
  workspaceId: string,
  id: string,
): Promise<MeetingRow> {
  const rows = await q
    .select(withProject)
    .from(meetings)
    .where(and(visibleMeetings(workspaceId), eq(meetings.id, id)))
  if (rows.length === 0) throw new MeetingNotFoundError()
  const [row] = await hydrate(q, rows)
  return row!
}

export async function createMeeting(
  q: Queryable,
  workspaceId: string,
  body: CreateMeetingBody,
): Promise<MeetingRow> {
  if (body.projectId) await assertProject(q, workspaceId, body.projectId)
  await assertAttendees(q, workspaceId, body.attendeeIds ?? [])
  const id = uuidv7()
  await q.insert(meetings).values({
    id,
    workspaceId,
    projectId: body.projectId ?? null,
    title: body.title,
    startsAt: new Date(body.startsAt),
    endsAt: new Date(body.endsAt),
    location: body.location ?? null,
    note: body.note ?? null,
  })
  await putAttendees(q, id, body.attendeeIds ?? [])
  return getMeeting(q, workspaceId, id)
}

export async function updateMeeting(
  q: Queryable,
  workspaceId: string,
  id: string,
  patch: UpdateMeetingBody,
): Promise<MeetingRow> {
  // Read first, so an id from another workspace is "not found" before anything is written.
  const current = await getMeeting(q, workspaceId, id)
  if (patch.projectId) await assertProject(q, workspaceId, patch.projectId)
  if (patch.attendeeIds) await assertAttendees(q, workspaceId, patch.attendeeIds)

  const startsAt = patch.startsAt ? new Date(patch.startsAt) : current.startsAt
  const endsAt = patch.endsAt ? new Date(patch.endsAt) : current.endsAt
  // MOVING ONE END IS CHECKED AGAINST THE OTHER, which only the server knows: the contract can
  // only compare two values it was both sent, so dragging a start past a stored end would pass it.
  if (endsAt.getTime() <= startsAt.getTime()) throw new BackwardsMeetingError()

  // The two instants are pulled out and re-added as Dates: the contract carries them as ISO
  // strings, and handing a string to a timestamptz column is how a type error becomes a runtime
  // one.
  const { attendeeIds, startsAt: _s, endsAt: _e, ...fields } = patch
  await q
    .update(meetings)
    .set({
      ...fields,
      ...(patch.startsAt ? { startsAt } : {}),
      ...(patch.endsAt ? { endsAt } : {}),
      updatedAt: new Date(),
    })
    .where(and(visibleMeetings(workspaceId), eq(meetings.id, id)))
  if (attendeeIds) await putAttendees(q, id, attendeeIds)
  return getMeeting(q, workspaceId, id)
}

export async function softDeleteMeeting(
  q: Queryable,
  workspaceId: string,
  id: string,
): Promise<void> {
  const deleted = await q
    .update(meetings)
    .set({ deletedAt: new Date() })
    .where(and(visibleMeetings(workspaceId), eq(meetings.id, id)))
    .returning({ id: meetings.id })
  if (deleted.length === 0) throw new MeetingNotFoundError()
}
