import {
  BIRTHDAY_CALENDARS,
  CHANNEL_KINDS,
  CIRCLES,
  GENDERS,
  LINK_KINDS,
  OBJECT_TYPES,
  READING_KINDS,
  READING_STATUSES,
  TASK_STATUSES,
} from '@ctws/contracts'
import { relations, sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    // IANA timezone identifier. Every day boundary in this app is decided in it.
    timezone: text('timezone').notNull(),
    // Instance role (who may administer the instance), not a workspace role. See auth/roles.ts.
    role: text('role').notNull().default('member'),
    // Soft disable: set means the user cannot authenticate; the row and its data stay.
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('users_email_key').on(t.email),
    check('users_role_check', sql`${t.role} in ('admin', 'maintainer', 'member')`),
  ],
)

export const sessions = pgTable(
  'sessions',
  {
    // An INTERNAL id. Nothing outside this table ever sees it: the cookie carries a token whose
    // SHA-256 is `token_hash` below, and every lookup goes through that.
    id: uuid('id').primaryKey(),
    /** `sha256(cookie token)`, hex. Unique, because it is what a session is looked up by. */
    tokenHash: text('token_hash').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // A unique INDEX and not `.unique()`, because that is what migration 0006 created. The two
  // enforce the same thing under different names, so a declaration that disagrees with the
  // migration makes every `drizzle-kit generate` propose adding a constraint the database already
  // has in another form. `users_email_key` above is spelled the same way.
  (t) => [
    uniqueIndex('sessions_token_hash_idx').on(t.tokenHash),
    // Deleting a user cascades to their sessions, and without this that cascade is a sequential
    // scan of the whole table. Signing in repeatedly leaves a row each time, so the table is the
    // one here that grows without anybody deleting anything.
    index('sessions_user_idx').on(t.userId),
  ],
)

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    // Workspace role (deferred: nothing reads it yet). Independent of users.role.
    check('workspace_members_role_check', sql`${t.role} in ('owner', 'member')`),
  ],
)

// Fractional-index ranks sort correctly only under bytewise comparison. Drizzle's text() has no
// collation option (0.45.3), so COLLATE "C" on projects.rank and tasks.rank is added by hand in
// the generated migration (drizzle/0002_*.sql). Regenerating that migration must keep it; the
// task-schema test asserts the declared collation.
export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color'),
    // Exactly one per workspace, enforced by a partial unique index that lives in the migration
    // SQL (drizzle 0.45.3 cannot express `unique ... where`). Quick capture lands here so that
    // capturing costs no decisions; everything else about it is an ordinary project.
    isInbox: boolean('is_inbox').notNull().default(false),
    // COLLATE "C" lives in the migration SQL; see note above. Deliberately not unique.
    rank: text('rank').notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // THE TENANT CHOKEPOINT'S OWN INDEX. Every authenticated read reaches a workspace through
    // `visibleProjects`, and a task has no workspace of its own -- so without this, each of them
    // opens with a sequential scan of EVERY project in the database. Measured on a database
    // holding 92,839 other projects: `/today` spent 3.8 of its 5.0ms there and read 1,359 pages
    // to return five rows. The task side was already an index scan; this was the half that was
    // not. It matters because the cost of one person's read grew with everybody else's data.
    index('projects_workspace_idx').on(t.workspaceId),
  ],
)

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey(),
    // Denormalised onto every task (spec 5.1) so "all tasks of a project" needs no recursion.
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id').references((): AnyPgColumn => tasks.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    notes: text('notes'),
    status: text('status').notNull(),
    // A calendar day with no time zone, deliberately not a timestamp.
    scheduledOn: date('scheduled_on'),
    dueAt: timestamp('due_at', { withTimezone: true }),
    // COLLATE "C" lives in the migration SQL; see note above. Deliberately not unique:
    // (rank, id) is the sibling order and id is the tiebreak.
    rank: text('rank').notNull(),
    manualProgress: numeric('manual_progress', { precision: 3, scale: 2 }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('tasks_project_id_idx').on(t.projectId),
    index('tasks_parent_id_idx').on(t.parentId),
    // Built from the shared list so the CHECK and the Zod enum cannot drift apart.
    check(
      'tasks_status_check',
      sql`${t.status} in (${sql.join(
        TASK_STATUSES.map((s) => sql.raw(`'${s}'`)),
        sql`, `,
      )})`,
    ),
  ],
)

/**
 * WHICH TASK HAS TO WAIT FOR WHICH.
 *
 * A SECOND GRAPH, COMPLETELY SEPARATE FROM THE PARENT TREE. The tree says what a piece of work
 * is made of; this says what has to happen first. Siblings can depend on each other, and so can
 * tasks in different projects -- a release here can wait on another repo's CI -- so there is no
 * containment relationship between the two graphs at all.
 *
 * NOTHING HERE RECORDS WHETHER SOMETHING IS BLOCKED. That is derived: a task is blocked while any
 * of its blockers is unfinished. Finishing A unblocks B with no second write, so the two can
 * never drift apart.
 *
 * `workspace_id` is denormalised, as on `task_events` and for the same reason: every query here
 * is tenant-scoped and reaching the workspace through two joins buys nothing.
 */
export const taskDependencies = pgTable(
  'task_dependencies',
  {
    /** The one that has to finish first. */
    blockerId: uuid('blocker_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    /** The one that waits. */
    blockedId: uuid('blocked_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.blockerId, t.blockedId] }),
    // The reverse lookup: "what is this task blocking", for the detail pane and for the cycle
    // check, which walks the graph in that direction.
    index('task_dependencies_blocked_idx').on(t.blockedId),
    // A task cannot wait for itself. The cycle check below catches longer loops; this one is
    // worth a constraint because it is the loop a single bad request can make.
    check('task_dependencies_not_self', sql`${t.blockerId} <> ${t.blockedId}`),
  ],
)

/**
 * READING -- the SECOND module's own table.
 *
 * It belongs to the reading module and nothing in the task module may read it. What it shares with
 * tasks is only what the SHELL owns: the workspace, and an optional project, because a project is
 * the shell's organising dimension and an article about CTWS belongs to CTWS exactly as a task
 * does.
 *
 * It carries `workspace_id` directly rather than reaching one through a project, because a
 * reading item NEED NOT have a project: a book you are reading is not a line of work.
 */
const inList = (column: AnyPgColumn, values: readonly string[]) =>
  sql`${column} in (${sql.join(
    values.map((v) => sql.raw(`'${v}'`)),
    sql`, `,
  )})`

export const readingItems = pgTable(
  'reading_items',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    // SET NULL, not cascade: deleting a project must not silently throw away a book.
    kind: text('kind').notNull(),
    /** Nullable for a link: capture is a pasted url, and the list shows the host until someone
     *  types a title. */
    title: text('title'),
    /**
     * 抓回来的标题与那句话，以及抓的时间。
     *
     * 和 `title` 分开：人改过的标题不能被重抓盖掉。`fetched_at` 记着是什么时候抓的 —— 抓不到
     * 也要记上，否则分不出「还没抓过」和「抓过但对面什么都不给」。
     */
    fetchedTitle: text('fetched_title'),
    fetchedSummary: text('fetched_summary'),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }),
    url: text('url'),
    author: text('author'),
    status: text('status').notNull(),
    /** The day you mean to finish it by. A calendar day, deliberately not a timestamp. */
    planOn: date('plan_on'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The list's own order, newest first -- a reading pile has no hand-kept rank.
    index('reading_items_workspace_created_idx').on(t.workspaceId, t.createdAt.desc()),
    // Built from the shared lists so the CHECKs and the Zod enums cannot drift apart, the same
    // way `tasks_status_check` is.
    check('reading_items_kind_check', inList(t.kind, READING_KINDS)),
    check('reading_items_status_check', inList(t.status, READING_STATUSES)),
    // The shapes, said once more where the data actually lives: the contract's union is the
    // edge, and an edge is not a guarantee about rows written by anything else.
    check(
      'reading_items_shape_check',
      sql`(${t.kind} = 'link' and ${t.url} is not null and ${t.author} is null)
          or (${t.kind} = 'book' and ${t.url} is null and ${t.title} is not null)`,
    ),
  ],
)

/**
 * CONTACTS -- THE THIRD MODULE's own tables, modelled on vCard 4.0 (RFC 6350).
 *
 * Like reading items, a contact carries `workspace_id` directly and its project is optional: a
 * person you know is not a line of work. ON DELETE SET NULL on the project for the same reason --
 * deleting a project must not delete the people.
 */
export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    /** vCard's `FN`: the name as a person writes it, not parsed into parts. */
    name: text('name').notNull(),
    /** vCard's `ORG`. */
    org: text('org'),
    /** vCard's `NOTE`. */
    note: text('note'),
    /**
     * THE BIRTHDAY, stored in the calendar it was GIVEN in. A GROUP of
     * columns, all present or all absent: the CHECK below is what holds that, because half a
     * birthday read back blows up in the conversion rather than being quietly wrong.
     */
    birthdayCalendar: text('birthday_calendar'),
    /** Null when only the month and the day are known -- RFC 6350's `BDAY:--0415`. */
    birthdayYear: integer('birthday_year'),
    birthdayMonth: integer('birthday_month'),
    birthdayDay: integer('birthday_day'),
    /** Lunar only. */
    birthdayLeapMonth: boolean('birthday_leap_month').notNull().default(false),
    /** 0..11, 子 to 亥. A branch and not a clock. */
    birthdayHourBranch: integer('birthday_hour_branch'),
    /** How early to surface this person: 7 / 3 / 1 / 0 days. One choice, not four switches. */
    birthdayRemindLead: integer('birthday_remind_lead').notNull().default(7),
    /** vCard's `GENDER`. */
    gender: text('gender'),
    /** A place name, not an `ADR`: a city is not something you can post a letter to. */
    hometown: text('hometown'),
    city: text('city'),
    /** vCard's `TITLE`, beside `ORG`. */
    title: text('title'),
    /** Where this person sits in your life, for the lens to group and filter by. */
    circle: text('circle'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('contacts_workspace_name_idx').on(t.workspaceId, t.name),
    check('contacts_birthday_calendar_check', inList(t.birthdayCalendar, BIRTHDAY_CALENDARS)),
    check('contacts_gender_check', inList(t.gender, GENDERS)),
    check('contacts_circle_check', inList(t.circle, CIRCLES)),
    check(
      'contacts_birthday_month_check',
      sql`${t.birthdayMonth} is null or ${t.birthdayMonth} between 1 and 12`,
    ),
    check(
      'contacts_birthday_day_check',
      sql`${t.birthdayDay} is null or ${t.birthdayDay} between 1 and 31`,
    ),
    check(
      'contacts_birthday_hour_check',
      sql`${t.birthdayHourBranch} is null or ${t.birthdayHourBranch} between 0 and 11`,
    ),
    check('contacts_birthday_lead_check', sql`${t.birthdayRemindLead} in (0, 1, 3, 7)`),
    // A group, not a field (the same reason `reading_items_shape_check` exists).
    check(
      'contacts_birthday_group_check',
      sql`(${t.birthdayCalendar} is null and ${t.birthdayMonth} is null and ${t.birthdayDay} is null)
          or (${t.birthdayCalendar} is not null and ${t.birthdayMonth} is not null and ${t.birthdayDay} is not null)`,
    ),
    index('contacts_birthday_idx').on(t.workspaceId, t.birthdayMonth, t.birthdayDay),
  ],
)

/**
 * vCard's `EMAIL` / `TEL` / `URL`, which are REPEATABLE properties.
 *
 * A table and not two columns on `contacts`: one address per person is wrong the first time
 * somebody has a work address and a personal one, which is why vCard has allowed several since
 * 1996. Rows are replaced as a set by the contact's own endpoint; they have no endpoints of their
 * own, because a person's addresses are read, shown and edited together.
 */
export const contactChannels = pgTable(
  'contact_channels',
  {
    id: uuid('id').primaryKey(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    value: text('value').notNull(),
    /** vCard's TYPE parameter, as free text: a label of your own beats any fixed list. */
    label: text('label'),
    /** The order the person put them in. The first of a kind is the one a row shows. */
    rank: integer('rank').notNull(),
  },
  (t) => [
    index('contact_channels_contact_idx').on(t.contactId, t.rank),
    check('contact_channels_kind_check', inList(t.kind, CHANNEL_KINDS)),
  ],
)

/**
 * MEETINGS -- the fourth module's own table, on iCalendar's `VEVENT` (RFC 5545).
 *
 * A WALL CLOCK PLUS A ZONE, never an instant. Every Tuesday at 09:00 Toronto time is at 09:00
 * in Toronto forever; its UTC instant moves by an hour twice a year. Storing the instant and advancing it by
 * seven days would hold the instant still and move the meeting for the people in the room -- the
 * bug every hand-rolled recurrence ships. `occurrences.ts` has the whole argument.
 *
 * A DURATION rather than an end instant, for the same reason: a 60-minute meeting is 60 minutes
 * on the day the clocks change too. RFC 5545 offers both and `DURATION` is the one that survives.
 */
export const meetings = pgTable(
  'meetings',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    /** `SUMMARY`. */
    title: text('title').notNull(),
    /** `DTSTART`'s local half: `YYYY-MM-DDTHH:mm`, no zone. */
    startsLocal: text('starts_local').notNull(),
    /** `DTSTART`'s `TZID`: an IANA zone. A meeting in Toronto and one in London are not the same
     *  wall clock, and the account's own zone is neither of them. */
    timeZone: text('time_zone').notNull(),
    /** `DURATION`, in minutes. */
    durationMinutes: integer('duration_minutes').notNull(),
    /** `RRULE`, without the `RRULE:` prefix. Null means it happens once. */
    rrule: text('rrule'),
    location: text('location'),
    /** `DESCRIPTION`. */
    note: text('note'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('meetings_workspace_idx').on(t.workspaceId),
    check('meetings_duration_positive', sql`${t.durationMinutes} > 0`),
    // The stored shape of a wall clock, checked where the data lives and not only at the edge.
    check(
      'meetings_starts_local_shape',
      sql`${t.startsLocal} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$'`,
    ),
  ],
)

/**
 * `EXDATE` AND `RECURRENCE-ID` IN ONE TABLE: the single occurrences that differ from their series.
 *
 * `recurrence_id` is the local time the RULE put the occurrence at -- the occurrence's identity,
 * which does not change when the occurrence is moved. `cancelled` is `EXDATE`; the nullable
 * columns are the override, each null meaning "same as the series".
 *
 * One table rather than two because they are one question -- what is different about this one --
 * and a cancellation is one answer to it.
 */
export const meetingExceptions = pgTable(
  'meeting_exceptions',
  {
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    /** `RECURRENCE-ID`: which occurrence, by the series' own local time for it. */
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
    // A cancelled occurrence that also carries an override is two answers to one question.
    check(
      'meeting_exceptions_cancelled_is_bare',
      sql`not ${t.cancelled} or (${t.startsLocal} is null and ${t.durationMinutes} is null)`,
    ),
  ],
)

/**
 * EDGES BETWEEN THINGS -- the SHELL's table, and the one way anything reaches anything else.
 *
 * Polymorphic on purpose: an edge may join any two kinds of thing. A join table per pair gives
 * every module one column pointing at projects and no way to say anything else.
 *
 * NO FOREIGN KEY to either end, because there is no one table to point at. It costs nothing in
 * practice: everything in this app is SOFT-deleted, so a foreign key would never have fired
 * anyway, and every read already resolves an id against the owning table and drops what it cannot
 * see. The workspace IS a foreign key, so a deleted workspace takes its edges with it.
 */
export const links = pgTable(
  'links',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    fromType: text('from_type').notNull(),
    fromId: uuid('from_id').notNull(),
    toType: text('to_type').notNull(),
    toId: uuid('to_id').notNull(),
    kind: text('kind').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One edge of one kind between two things. Asking twice is the same fact.
    primaryKey({ columns: [t.fromType, t.fromId, t.toType, t.toId, t.kind] }),
    // BOTH DIRECTIONS are read: who is at a meeting, and which meetings a person has been at.
    index('links_from_idx').on(t.workspaceId, t.fromType, t.fromId),
    index('links_to_idx').on(t.workspaceId, t.toType, t.toId),
    check('links_type_check', inList(t.fromType, OBJECT_TYPES)),
    check('links_to_type_check', inList(t.toType, OBJECT_TYPES)),
    check(
      'links_kind_check',
      inList(
        t.kind,
        LINK_KINDS.map((l) => l.kind),
      ),
    ),
    // A thing is not related to itself.
    check('links_not_self', sql`not (${t.fromType} = ${t.toType} and ${t.fromId} = ${t.toId})`),
  ],
)

export const taskEvents = pgTable(
  'task_events',
  {
    id: uuid('id').primaryKey(),
    // NO ACTION, not cascade: hard-deleting a task must fail loudly rather than erase its history
    // (spec 5.4). NO ACTION rather than RESTRICT because it is checked at statement end, so a
    // workspace delete (which also cascades to task_events directly) succeeds whatever order
    // Postgres resolves the two cascade paths in.
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id),
    // Denormalised for the weekly review's per-workspace scan.
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id),
    type: text('type').notNull(),
    payload: jsonb('payload').notNull(),
    source: text('source').notNull().default('user'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('task_events_workspace_occurred_idx').on(t.workspaceId, t.occurredAt.desc()),
    index('task_events_task_occurred_idx').on(t.taskId, t.occurredAt.desc()),
    // A later milestone adds 'github'.
    check('task_events_source_check', sql`${t.source} in ('user')`),
  ],
)

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  memberships: many(workspaceMembers),
}))
