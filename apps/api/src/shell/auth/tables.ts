import { ROLES, type Role, type UserId, type WorkspaceId } from '@ctws/contracts'
import { inList } from '../../platform/db/sql'
import {
  check,
  index,
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
    id: uuid('id').$type<UserId>().primaryKey(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    // IANA zone; every day boundary in the app is decided in it.
    timezone: text('timezone').notNull(),
    // Instance role, not a workspace role.
    role: text('role').$type<Role>().notNull().default('member'),
    // Set means the account cannot sign in; its data stays.
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    // When the password was last changed; null for the one set at sign-up.
    passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('users_email_key').on(t.email),
    check('users_role_check', inList(t.role, ROLES)),
  ],
)

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey(),
    /** SHA-256 of the cookie token, hex. Sessions are looked up by it. */
    tokenHash: text('token_hash').notNull(),
    userId: uuid('user_id')
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // Unique indexes rather than `.unique()`, matching what the migrations created.
  (t) => [
    uniqueIndex('sessions_token_hash_idx').on(t.tokenHash),
    index('sessions_user_idx').on(t.userId),
  ],
)

export const workspaces = pgTable('workspaces', {
  id: uuid('id').$type<WorkspaceId>().primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  /**
   * When this workspace came to be in the new layout: at registration for a new one, at the end
   * of its move for one from before the redesign. Null means the move is still owed, and the
   * server will not serve it until then (REQ section 4).
   */
  movedAt: timestamp('moved_at', { withTimezone: true }),
})

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    workspaceId: uuid('workspace_id')
      .$type<WorkspaceId>()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // Every request finds its account's workspace by the user, not by the workspace.
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    index('workspace_members_user_idx').on(t.userId),
  ],
)

/** What a module's own table points at with a foreign key: the workspace that owns its rows. */
export const workspaceKeys = { id: workspaces.id }
