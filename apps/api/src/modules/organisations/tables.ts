import type { OrganisationId, PersonId, RoleId, WorkspaceId } from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { workspaceKeys } from '../../shell/auth'

/** A company, a law firm, a school (FR-047). Deleted outright: its tombstone is what remains. */
export const organisations = pgTable(
  'organisations',
  {
    id: uuid('id').$type<OrganisationId>().primaryKey(),
    workspaceId: uuid('workspace_id')
      .$type<WorkspaceId>()
      .notNull()
      .references(() => workspaceKeys.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Free text; the ones used so far are offered as a list. */
    type: text('type'),
    website: text('website'),
    /** The city's name as shown, and its key in the bundled table to tell namesakes apart. */
    city: text('city'),
    cityKey: text('city_key'),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('organisations_workspace_name_idx').on(t.workspaceId, t.name),
    unique('organisations_workspace_id_id_key').on(t.workspaceId, t.id),
  ],
)

export type Organisation = typeof organisations.$inferSelect

/**
 * A role a person holds or held at an organisation (FR-047): a title and a span of months, any of
 * which may be unknown. No end means the role is current; a person may hold several at once.
 *
 * No foreign key to the person: that table is another module's. The people module removes a
 * person's roles when the person goes, and a read drops a role whose person it cannot see.
 */
export const personRoles = pgTable(
  'person_roles',
  {
    id: uuid('id').$type<RoleId>().primaryKey(),
    workspaceId: uuid('workspace_id').$type<WorkspaceId>().notNull(),
    personId: uuid('person_id').$type<PersonId>().notNull(),
    organisationId: uuid('organisation_id').$type<OrganisationId>().notNull(),
    title: text('title'),
    /** The first of the month, for a span known to the month. */
    fromMonth: date('from_month'),
    toMonth: date('to_month'),
    /** The order the person put them in. */
    rank: integer('rank').notNull(),
  },
  (t) => [
    index('person_roles_person_idx').on(t.personId, t.rank),
    index('person_roles_organisation_idx').on(t.organisationId),
    // The organisation is in the role's own workspace.
    foreignKey({
      name: 'person_roles_organisation_fk',
      columns: [t.workspaceId, t.organisationId],
      foreignColumns: [organisations.workspaceId, organisations.id],
    }).onDelete('cascade'),
    check(
      'person_roles_span_check',
      sql`${t.fromMonth} is null or ${t.toMonth} is null or ${t.fromMonth} <= ${t.toMonth}`,
    ),
  ],
)

export type PersonRole = typeof personRoles.$inferSelect
