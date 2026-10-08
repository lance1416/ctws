import { READING_KINDS, READING_STATUSES, TASK_STATUSES } from '@ctws/contracts'
import { relations, sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  boolean,
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

export const sessions = pgTable(
  'sessions',
  {
    // An INTERNAL id. Nothing outside this table ever sees it: the cookie carries a token whose
    // SHA-256 is `token_hash` below (D2), and every lookup goes through that.
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
  // A unique INDEX and not `.unique()`, because that is what migration 0006 actually created.
  // The two enforce the same thing under different names, and the declaration was the half that
  // was wrong: every `drizzle-kit generate` after it proposed adding a constraint the database
  // already had in another form. `users_email_key` above is spelled the same way.
  (t) => [uniqueIndex('sessions_token_hash_idx').on(t.tokenHash)],
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
export const projects = pgTable('projects', {
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

/**
 * WHICH TASK HAS TO WAIT FOR WHICH (D64). 「A 没做完 B 做不了」.
 *
 * A SECOND GRAPH, COMPLETELY SEPARATE FROM THE PARENT TREE. The tree says what a piece of work
 * is made of; this says what has to happen first. Siblings can depend on each other, and so can
 * tasks in different projects -- 「等 rrgen 的 CI 跑通才能发 CTWS 的 release」 is a real sentence
 * -- so there is no containment relationship between the two graphs at all.
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
 * 待读清单 -- the SECOND module's own table.
 *
 * It belongs to the reading module and nothing in the task module may read it (module-boundary
 * contract §3). What it shares with tasks is only what the SHELL owns: the workspace, and an
 * optional project, because a project is the shell's organising dimension and an article about
 * CTWS belongs to CTWS exactly as a task does.
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
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    kind: text('kind').notNull(),
    /** Nullable for a link: capture is a pasted url, and the list shows the host until someone
     *  types a title. */
    title: text('title'),
    url: text('url'),
    author: text('author'),
    status: text('status').notNull(),
    /** 「想读完的那天」. A calendar day with no time zone, deliberately not a timestamp. */
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
