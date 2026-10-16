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
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] })],
)
