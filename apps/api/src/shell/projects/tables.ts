import { type ProjectColor, type ProjectId, type WorkspaceId } from '@ctws/contracts'
import { boolean, index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { workspaces } from '../auth/tables'

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').$type<ProjectId>().primaryKey(),
    workspaceId: uuid('workspace_id')
      .$type<WorkspaceId>()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').$type<ProjectColor>().notNull(),
    // One per workspace, by a partial unique index in the migration SQL.
    isInbox: boolean('is_inbox').notNull().default(false),
    // COLLATE "C" is added in the migration SQL so fractional ranks compare bytewise; not unique.
    rank: text('rank').notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('projects_workspace_idx').on(t.workspaceId),
    // What a row in the same workspace points at.
    unique('projects_workspace_id_id_key').on(t.workspaceId, t.id),
  ],
)

export type Project = typeof projects.$inferSelect

/** What a module's own table points at with a foreign key: a project in its workspace. */
export const projectKeys = { workspaceId: projects.workspaceId, id: projects.id }
