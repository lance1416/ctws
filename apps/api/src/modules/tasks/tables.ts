import {
  TASK_STATUSES,
  type TaskEventType,
  type TaskStatus,
  type ProjectId,
  type TaskId,
  type WorkspaceId,
} from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import {
  check,
  date,
  foreignKey,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { inList } from '../../platform/db/sql'
import { workspaces } from '../../shell/auth/tables'
import { projects } from '../../shell/projects/tables'

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').$type<TaskId>().primaryKey(),
    // The project's, carried so that every row hanging off a task can be held to its workspace by
    // a foreign key.
    workspaceId: uuid('workspace_id').$type<WorkspaceId>().notNull(),
    // Every task carries its project, so a project's tasks need no recursion.
    projectId: uuid('project_id').$type<ProjectId>().notNull(),
    parentId: uuid('parent_id').$type<TaskId>(),
    title: text('title').notNull(),
    notes: text('notes'),
    status: text('status').$type<TaskStatus>().notNull(),
    // A calendar day, not an instant.
    scheduledOn: date('scheduled_on'),
    dueAt: timestamp('due_at', { withTimezone: true }),
    // COLLATE "C" is added in the migration SQL; (rank, id) is the sibling order.
    rank: text('rank').notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('tasks_project_id_idx').on(t.projectId),
    index('tasks_parent_id_idx').on(t.parentId),
    check('tasks_status_check', inList(t.status, TASK_STATUSES)),
    unique('tasks_workspace_id_id_key').on(t.workspaceId, t.id),
    // The project and the parent are in the task's own workspace.
    foreignKey({
      name: 'tasks_project_fk',
      columns: [t.workspaceId, t.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'tasks_parent_fk',
      columns: [t.workspaceId, t.parentId],
      foreignColumns: [t.workspaceId, t.id],
    }).onDelete('cascade'),
  ],
)

/** Which task waits for which: a graph separate from the parent tree, across projects. */
export const taskDependencies = pgTable(
  'task_dependencies',
  {
    /** Has to finish first. */
    blockerId: uuid('blocker_id').$type<TaskId>().notNull(),
    /** Waits. */
    blockedId: uuid('blocked_id').$type<TaskId>().notNull(),
    workspaceId: uuid('workspace_id')
      .$type<WorkspaceId>()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.blockerId, t.blockedId] }),
    index('task_dependencies_blocked_idx').on(t.blockedId),
    check('task_dependencies_not_self', sql`${t.blockerId} <> ${t.blockedId}`),
    // Both tasks are in the dependency's workspace.
    foreignKey({
      name: 'task_dependencies_blocker_fk',
      columns: [t.workspaceId, t.blockerId],
      foreignColumns: [tasks.workspaceId, tasks.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'task_dependencies_blocked_fk',
      columns: [t.workspaceId, t.blockedId],
      foreignColumns: [tasks.workspaceId, tasks.id],
    }).onDelete('cascade'),
  ],
)

export const taskEvents = pgTable(
  'task_events',
  {
    id: uuid('id').primaryKey(),
    taskId: uuid('task_id').$type<TaskId>().notNull(),
    workspaceId: uuid('workspace_id')
      .$type<WorkspaceId>()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    type: text('type').$type<TaskEventType>().notNull(),
    payload: jsonb('payload').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('task_events_workspace_occurred_idx').on(t.workspaceId, t.occurredAt.desc()),
    index('task_events_task_occurred_idx').on(t.taskId, t.occurredAt.desc()),
    // In the task's workspace. No cascade: hard-deleting a task fails rather than erasing its
    // history.
    foreignKey({
      name: 'task_events_task_fk',
      columns: [t.workspaceId, t.taskId],
      foreignColumns: [tasks.workspaceId, tasks.id],
    }),
  ],
)

export type Task = typeof tasks.$inferSelect
