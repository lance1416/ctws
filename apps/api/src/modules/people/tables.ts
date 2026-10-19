import {
  BIRTHDAY_CALENDARS,
  CHANNEL_KINDS,
  type Circle,
  CIRCLES,
  type Gender,
  GENDERS,
  REMIND_LEAD_DEFAULT,
  REMIND_LEADS,
  type RemindLead,
  type CircleId,
  type PersonId,
  type ProjectId,
  type WorkspaceId,
} from '@ctws/contracts'
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
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { inList } from '../../platform/db/sql'
import { workspaceKeys } from '../../shell/auth'
import { projectKeys } from '../../shell/projects'

/** A person, after vCard 4.0 (RFC 6350). Projects are links, not a column. */
export const people = pgTable(
  'people',
  {
    id: uuid('id').$type<PersonId>().primaryKey(),
    workspaceId: uuid('workspace_id')
      .$type<WorkspaceId>()
      .notNull()
      .references(() => workspaceKeys.id, { onDelete: 'cascade' }),
    /**
     * vCard `FN`: the name as shown, worked out from the three parts below (FR-049). Kept as the
     * column the old pages read until they are replaced; always equal to the display name.
     */
    name: text('name').notNull(),
    /** vCard `N`: given, middle (several as one string), family; only the given name is needed. */
    givenName: text('given_name').notNull(),
    middleName: text('middle_name'),
    familyName: text('family_name'),
    /** The letter the person is filed under, A to Z or `#`, from the family name's pinyin or initial. */
    sortKey: text('sort_key').notNull(),
    /** IANA zone, from the city they live in unless set by hand (FR-049). */
    timeZone: text('time_zone'),
    timeZoneSource: text('time_zone_source').$type<'city' | 'manual'>(),
    /** The cities' keys in the bundled table (`name|region|country`), to tell namesakes apart. */
    cityKey: text('city_key'),
    hometownKey: text('hometown_key'),
    /** Being replaced by roles at organisations; kept until the migration report is done. */
    org: text('org'),
    note: text('note'),
    /** The birthday in the calendar it was given in; the group check keeps it whole. */
    birthdayCalendar: text('birthday_calendar').$type<(typeof BIRTHDAY_CALENDARS)[number]>(),
    /** Null when only the month and day are known (`BDAY:--0415`). */
    birthdayYear: integer('birthday_year'),
    birthdayMonth: integer('birthday_month'),
    birthdayDay: integer('birthday_day'),
    /** Lunar only. */
    birthdayLeapMonth: boolean('birthday_leap_month').notNull().default(false),
    /** 0..11, 子 to 亥. */
    birthdayHourBranch: integer('birthday_hour_branch'),
    /** Days ahead to surface the birthday: 7, 3, 1 or 0. */
    birthdayRemindLead: integer('birthday_remind_lead')
      .$type<RemindLead>()
      .notNull()
      .default(REMIND_LEAD_DEFAULT),
    gender: text('gender').$type<Gender>(),
    hometown: text('hometown'),
    city: text('city'),
    title: text('title'),
    circle: text('circle').$type<Circle>(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('people_workspace_name_idx').on(t.workspaceId, t.name),
    index('people_workspace_sort_idx').on(t.workspaceId, t.sortKey, t.name),
    check(
      'people_time_zone_source_check',
      sql`(${t.timeZone} is null and ${t.timeZoneSource} is null)
          or (${t.timeZone} is not null and ${t.timeZoneSource} in ('city', 'manual'))`,
    ),
    check('people_birthday_calendar_check', inList(t.birthdayCalendar, BIRTHDAY_CALENDARS)),
    check('people_gender_check', inList(t.gender, GENDERS)),
    check('people_circle_check', inList(t.circle, CIRCLES)),
    check(
      'people_birthday_month_check',
      sql`${t.birthdayMonth} is null or ${t.birthdayMonth} between 1 and 12`,
    ),
    check(
      'people_birthday_day_check',
      sql`${t.birthdayDay} is null or ${t.birthdayDay} between 1 and 31`,
    ),
    check(
      'people_birthday_hour_check',
      sql`${t.birthdayHourBranch} is null or ${t.birthdayHourBranch} between 0 and 11`,
    ),
    // Ascending, as the constraint was first written, so the schema does not drift.
    check(
      'people_birthday_lead_check',
      inList(
        t.birthdayRemindLead,
        [...REMIND_LEADS].sort((a, b) => a - b),
      ),
    ),
    // The day exists in its month; February allows 29 because the year may be unknown.
    check(
      'people_birthday_daymonth_check',
      sql`${t.birthdayDay} is null
          or (${t.birthdayCalendar} = 'lunar' and ${t.birthdayDay} <= 30)
          or (${t.birthdayCalendar} = 'solar' and ${t.birthdayDay} <=
              (array[31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31])[${t.birthdayMonth}])`,
    ),
    check(
      'people_birthday_group_check',
      sql`(${t.birthdayCalendar} is null and ${t.birthdayMonth} is null and ${t.birthdayDay} is null)
          or (${t.birthdayCalendar} is not null and ${t.birthdayMonth} is not null and ${t.birthdayDay} is not null)`,
    ),
    index('people_birthday_idx').on(t.workspaceId, t.birthdayMonth, t.birthdayDay),
  ],
)

/** What another module points at with a foreign key: a person. */
export const personKeys = { id: people.id }

/** The projects a person is in (FR-042): a field, replaced as a set; several at once. */
export const personProjects = pgTable(
  'person_projects',
  {
    personId: uuid('person_id')
      .$type<PersonId>()
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id').$type<WorkspaceId>().notNull(),
    projectId: uuid('project_id').$type<ProjectId>().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.personId, t.projectId] }),
    index('person_projects_project_idx').on(t.projectId),
    foreignKey({
      name: 'person_projects_project_fk',
      columns: [t.workspaceId, t.projectId],
      foreignColumns: [projectKeys.workspaceId, projectKeys.id],
    }).onDelete('cascade'),
  ],
)

/** Other names a person goes by (FR-049): a Chinese name, an English name, a nickname. */
export const personAliases = pgTable(
  'person_aliases',
  {
    id: uuid('id').primaryKey(),
    personId: uuid('person_id')
      .$type<PersonId>()
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** "Chinese name", "Nickname": free text. */
    label: text('label'),
    rank: integer('rank').notNull(),
  },
  (t) => [index('person_aliases_person_idx').on(t.personId, t.rank)],
)

/** The circles you keep (FR-049): a list of your own, in your order; a person may be in several. */
export const circles = pgTable(
  'circles',
  {
    id: uuid('id').$type<CircleId>().primaryKey(),
    workspaceId: uuid('workspace_id')
      .$type<WorkspaceId>()
      .notNull()
      .references(() => workspaceKeys.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    rank: integer('rank').notNull(),
  },
  (t) => [unique('circles_workspace_name_key').on(t.workspaceId, t.name)],
)

export const personCircles = pgTable(
  'person_circles',
  {
    personId: uuid('person_id')
      .$type<PersonId>()
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    circleId: uuid('circle_id')
      .$type<CircleId>()
      .notNull()
      .references(() => circles.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.personId, t.circleId] }),
    index('person_circles_circle_idx').on(t.circleId),
  ],
)

/** vCard's repeatable `EMAIL` / `TEL` / `URL`, replaced as a set with the person. */
export const personChannels = pgTable(
  'person_channels',
  {
    id: uuid('id').primaryKey(),
    personId: uuid('person_id')
      .$type<PersonId>()
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<(typeof CHANNEL_KINDS)[number]>().notNull(),
    value: text('value').notNull(),
    /** vCard's `TYPE`, as free text. */
    label: text('label'),
    /** The order the person put them in; the first of a kind is the one a row shows. */
    rank: integer('rank').notNull(),
  },
  (t) => [
    index('person_channels_person_idx').on(t.personId, t.rank),
    check('person_channels_kind_check', inList(t.kind, CHANNEL_KINDS)),
  ],
)
