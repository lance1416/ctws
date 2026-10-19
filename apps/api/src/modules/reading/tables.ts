import {
  READING_KINDS,
  READING_STATUSES,
  type PersonId,
  type ProjectId,
  type ReadingId,
  type WorkspaceId,
} from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import { check, date, foreignKey, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { inList } from '../../platform/db/sql'
import { workspaceKeys } from '../../shell/auth'
import { projectKeys } from '../../shell/projects'

export const readingItems = pgTable(
  'reading_items',
  {
    id: uuid('id').$type<ReadingId>().primaryKey(),
    workspaceId: uuid('workspace_id')
      .$type<WorkspaceId>()
      .notNull()
      .references(() => workspaceKeys.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<(typeof READING_KINDS)[number]>().notNull(),
    /** Null for a link until someone names it; the list shows the address meanwhile. */
    title: text('title'),
    /** What the page itself says, kept apart from `title` so a refetch never overwrites a name. */
    fetchedTitle: text('fetched_title'),
    fetchedSummary: text('fetched_summary'),
    url: text('url'),
    author: text('author'),
    status: text('status').$type<(typeof READING_STATUSES)[number]>().notNull(),
    /** The day you mean to finish it by. */
    planOn: date('plan_on'),
    /** The project it belongs to and who recommended it (FR-042): fields, no longer edges. */
    projectId: uuid('project_id').$type<ProjectId>(),
    /** No foreign key: the people table is another module's; a read drops a person it cannot see. */
    recommendedBy: uuid('recommended_by').$type<PersonId>(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('reading_items_workspace_created_idx').on(t.workspaceId, t.createdAt.desc()),
    index('reading_items_project_idx').on(t.projectId),
    foreignKey({
      name: 'reading_items_project_fk',
      columns: [t.workspaceId, t.projectId],
      foreignColumns: [projectKeys.workspaceId, projectKeys.id],
    }).onDelete('set null'),
    check('reading_items_kind_check', inList(t.kind, READING_KINDS)),
    check('reading_items_status_check', inList(t.status, READING_STATUSES)),
    check(
      'reading_items_shape_check',
      sql`(${t.kind} = 'link' and ${t.url} is not null and ${t.author} is null)
          or (${t.kind} = 'book' and ${t.url} is null and ${t.title} is not null)`,
    ),
  ],
)
