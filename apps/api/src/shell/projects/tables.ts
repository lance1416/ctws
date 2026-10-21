import { type ProjectColor, type ProjectId, type StageId, type WorkspaceId } from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import {
  boolean,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
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
    /** On the square (FR-052); the move fills it from the name for projects from before. */
    initials: text('initials').notNull().default(''),
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

/**
 * The stages a project's tasks may be at (FR-040): "Applied", "Onsite", "Spec review". A list of
 * the project's own, in its order; a task names one by id, so a rename reaches every task.
 */
export const projectStages = pgTable(
  'project_stages',
  {
    id: uuid('id').$type<StageId>().primaryKey(),
    workspaceId: uuid('workspace_id').$type<WorkspaceId>().notNull(),
    projectId: uuid('project_id').$type<ProjectId>().notNull(),
    name: text('name').notNull(),
    rank: integer('rank').notNull(),
    /** Folded into a narrow strip on the board by stage (FR-058). */
    collapsed: boolean('collapsed').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Two names that differ only in case are one stage (FR-040, REQ v1.5).
    uniqueIndex('project_stages_project_name_key').on(t.projectId, sql`lower(${t.name})`),
    index('project_stages_project_idx').on(t.projectId, t.rank),
    unique('project_stages_workspace_id_id_key').on(t.workspaceId, t.id),
    foreignKey({
      name: 'project_stages_project_fk',
      columns: [t.workspaceId, t.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }).onDelete('cascade'),
  ],
)

/** What a module's own table points at with a foreign key: a project in its workspace. */
export const projectKeys = { workspaceId: projects.workspaceId, id: projects.id }

/** What a task points at with a foreign key: a stage in its workspace. */
export const stageKeys = { workspaceId: projectStages.workspaceId, id: projectStages.id }
