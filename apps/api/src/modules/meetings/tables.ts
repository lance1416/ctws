import type { MeetingId, PersonId, ProjectId, WorkspaceId } from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { workspaceKeys } from '../../shell/auth'
import { projectKeys } from '../../shell/projects'
import { personKeys } from '../people'

/**
 * A series, after iCalendar's `VEVENT` (RFC 5545): a wall clock plus a zone and a duration, never
 * an instant, so a weekly meeting stays at its local time across DST changes.
 */
export const meetings = pgTable(
  'meetings',
  {
    id: uuid('id').$type<MeetingId>().primaryKey(),
    workspaceId: uuid('workspace_id')
      .$type<WorkspaceId>()
      .notNull()
      .references(() => workspaceKeys.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    /** `DTSTART`'s local part, `YYYY-MM-DDTHH:mm`. */
    startsLocal: text('starts_local').notNull(),
    /** `DTSTART`'s `TZID`, an IANA zone. */
    timeZone: text('time_zone').notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    /** `RRULE` without its prefix; null when it happens once. */
    rrule: text('rrule'),
    /** A place; a link to join is its own column (FR-067). */
    location: text('location'),
    joinUrl: text('join_url'),
    /** Being replaced by notes hung on the meeting; kept until the migration report is done. */
    note: text('note'),
    /** The project it belongs to (FR-042): a field, no longer an edge. */
    projectId: uuid('project_id').$type<ProjectId>(),
    /**
     * When the first occurrence starts and the last one ends, overrides included; the end is null
     * for a rule that never stops. Kept by the service on every write, so a read of a window can
     * skip the series that miss it before expanding any.
     */
    firstStartsAt: timestamp('first_starts_at', { withTimezone: true }).notNull(),
    lastEndsAt: timestamp('last_ends_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('meetings_workspace_idx').on(t.workspaceId),
    index('meetings_window_idx').on(t.workspaceId, t.lastEndsAt),
    index('meetings_project_idx').on(t.projectId),
    check('meetings_duration_positive', sql`${t.durationMinutes} > 0`),
    check(
      'meetings_starts_local_shape',
      sql`${t.startsLocal} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$'`,
    ),
    // The project is in the meeting's own workspace; a deleted project leaves it unfiled.
    foreignKey({
      name: 'meetings_project_fk',
      columns: [t.workspaceId, t.projectId],
      foreignColumns: [projectKeys.workspaceId, projectKeys.id],
    }).onDelete('set null'),
  ],
)

/** Who is in the room (FR-042): a field of the series, replaced as a set. */
export const meetingAttendees = pgTable(
  'meeting_attendees',
  {
    meetingId: uuid('meeting_id')
      .$type<MeetingId>()
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    personId: uuid('person_id')
      .$type<PersonId>()
      .notNull()
      .references(() => personKeys.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.meetingId, t.personId] }),
    index('meeting_attendees_person_idx').on(t.personId),
  ],
)

/**
 * `EXDATE` and `RECURRENCE-ID` overrides: the occurrences that differ from their series, keyed by
 * the local time the rule gave them. Null columns mean "as the series".
 */
export const meetingExceptions = pgTable(
  'meeting_exceptions',
  {
    meetingId: uuid('meeting_id')
      .$type<MeetingId>()
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    recurrenceId: text('recurrence_id').notNull(),
    cancelled: boolean('cancelled').notNull().default(false),
    startsLocal: text('starts_local'),
    durationMinutes: integer('duration_minutes'),
  },
  (t) => [
    primaryKey({ columns: [t.meetingId, t.recurrenceId] }),
    check(
      'meeting_exceptions_duration_positive',
      sql`${t.durationMinutes} is null or ${t.durationMinutes} > 0`,
    ),
    check(
      'meeting_exceptions_cancelled_is_bare',
      sql`not ${t.cancelled} or (${t.startsLocal} is null and ${t.durationMinutes} is null)`,
    ),
  ],
)
