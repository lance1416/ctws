import type { MeetingId, WorkspaceId } from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { workspaces } from '../../shell/auth/tables'

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
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    /** `DTSTART`'s local part, `YYYY-MM-DDTHH:mm`. */
    startsLocal: text('starts_local').notNull(),
    /** `DTSTART`'s `TZID`, an IANA zone. */
    timeZone: text('time_zone').notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    /** `RRULE` without its prefix; null when it happens once. */
    rrule: text('rrule'),
    location: text('location'),
    note: text('note'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('meetings_workspace_idx').on(t.workspaceId),
    check('meetings_duration_positive', sql`${t.durationMinutes} > 0`),
    check(
      'meetings_starts_local_shape',
      sql`${t.startsLocal} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$'`,
    ),
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
