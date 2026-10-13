import {
  BIRTHDAY_CALENDARS,
  CHANNEL_KINDS,
  CIRCLES,
  GENDERS,
  REMIND_LEAD_DEFAULT,
} from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import { boolean, check, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { inList } from '../../platform/db/sql'
import { workspaces } from '../../shell/auth/tables'

/** A person, after vCard 4.0 (RFC 6350). Projects are links, not a column. */
export const people = pgTable(
  'people',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    /** vCard `FN`: the name as written, not split into parts. */
    name: text('name').notNull(),
    org: text('org'),
    note: text('note'),
    /** The birthday in the calendar it was given in; the group check keeps it whole. */
    birthdayCalendar: text('birthday_calendar'),
    /** Null when only the month and day are known (`BDAY:--0415`). */
    birthdayYear: integer('birthday_year'),
    birthdayMonth: integer('birthday_month'),
    birthdayDay: integer('birthday_day'),
    /** Lunar only. */
    birthdayLeapMonth: boolean('birthday_leap_month').notNull().default(false),
    /** 0..11, 子 to 亥. */
    birthdayHourBranch: integer('birthday_hour_branch'),
    /** Days ahead to surface the birthday: 7, 3, 1 or 0. */
    birthdayRemindLead: integer('birthday_remind_lead').notNull().default(REMIND_LEAD_DEFAULT),
    gender: text('gender'),
    hometown: text('hometown'),
    city: text('city'),
    title: text('title'),
    circle: text('circle'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('people_workspace_name_idx').on(t.workspaceId, t.name),
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
    check('people_birthday_lead_check', sql`${t.birthdayRemindLead} in (0, 1, 3, 7)`),
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

/** vCard's repeatable `EMAIL` / `TEL` / `URL`, replaced as a set with the person. */
export const personChannels = pgTable(
  'person_channels',
  {
    id: uuid('id').primaryKey(),
    personId: uuid('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
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
