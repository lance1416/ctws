import { TASK_STATUSES } from '@ctws/contracts'
import { relations, sql } from 'drizzle-orm'
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
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    // IANA timezone identifier; see spec §5 / Global Constraints
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

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
})

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
export const projects = pgTable('projects', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color'),
  // COLLATE "C" lives in the migration SQL; see note above. Deliberately not unique.
  rank: text('rank').notNull(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

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
