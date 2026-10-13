import { TASK_STATUSES, type TaskEventType, type TaskStatus } from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  check,
  date,
  index,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { inList } from '../../platform/db/sql'
import { users, workspaces } from '../../shell/auth/tables'
import { projects } from '../../shell/projects/tables'

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey(),
    // Every task carries its project, so a project's tasks need no recursion.
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id').references((): AnyPgColumn => tasks.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    notes: text('notes'),
    status: text('status').$type<TaskStatus>().notNull(),
    // A calendar day, not an instant.
    scheduledOn: date('scheduled_on'),
    dueAt: timestamp('due_at', { withTimezone: true }),
    // COLLATE "C" is added in the migration SQL; (rank, id) is the sibling order.
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
    check('tasks_status_check', inList(t.status, TASK_STATUSES)),
  ],
)

/** Which task waits for which: a graph separate from the parent tree, across projects. */
export const taskDependencies = pgTable(
  'task_dependencies',
  {
    /** Has to finish first. */
    blockerId: uuid('blocker_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    /** Waits. */
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
    index('task_dependencies_blocked_idx').on(t.blockedId),
    check('task_dependencies_not_self', sql`${t.blockerId} <> ${t.blockedId}`),
  ],
)

export const taskEvents = pgTable(
  'task_events',
  {
    id: uuid('id').primaryKey(),
    // No cascade: hard-deleting a task fails rather than erasing its history.
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id),
    type: text('type').$type<TaskEventType>().notNull(),
    payload: jsonb('payload').notNull(),
    source: text('source').notNull().default('user'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('task_events_workspace_occurred_idx').on(t.workspaceId, t.occurredAt.desc()),
    index('task_events_task_occurred_idx').on(t.taskId, t.occurredAt.desc()),
    check('task_events_source_check', sql`${t.source} in ('user')`),
  ],
)

export type Task = typeof tasks.$inferSelect
