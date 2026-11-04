import {
  ROLES,
  THEMES,
  type FileId,
  type Role,
  type Theme,
  type UserId,
  type WorkspaceId,
} from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import { inList } from '../../platform/db/sql'
import { files } from '../files/tables'
import {
  boolean,
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
    // The account's own name, in a person's three parts; all empty until it is given one.
    givenName: text('given_name'),
    middleName: text('middle_name'),
    familyName: text('family_name'),
    // Stored lowered, so a plain unique index is the case-insensitive one.
    username: text('username'),
    // The account's own photo; gone with the file, which only a sweep removes.
    avatarId: uuid('avatar_id')
      .$type<FileId>()
      .references(() => files.id, { onDelete: 'set null' }),
    passwordHash: text('password_hash').notNull(),
    // IANA zone; every day boundary in the app is decided in it.
    timezone: text('timezone').notNull(),
    // Instance role, not a workspace role.
    role: text('role').$type<Role>().notNull().default('member'),
    // Set means the account cannot sign in; its data stays.
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    // When the password was last changed; null for the one set at sign-up.
    passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }),
    // Single-key shortcuts on: off, only keys with Ctrl or Alt act. Kept with the
    // account, so it stays off on another computer.
    singleKeyShortcuts: boolean('single_key_shortcuts').notNull().default(true),
    /** The editor takes vim's keys: off unless the account turns it on. */
    vimKeys: boolean('vim_keys').notNull().default(false),
    /** A note's outline is shown beside it; the same on every note and screen. */
    outlineShown: boolean('outline_shown').notNull().default(true),
    /** A note runs the full width, or stops at a readable length. */
    readableLines: boolean('readable_lines').notNull().default(false),
    /** A note is shown as its Markdown source, not drawn. */
    sourceView: boolean('source_view').notNull().default(false),
    /** Null until chosen: a device then shows its own last choice, or the system's. */
    theme: text('theme').$type<Theme>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('users_email_key').on(t.email),
    uniqueIndex('users_username_key').on(t.username),
    check('users_role_check', inList(t.role, ROLES)),
    check('users_theme_check', inList(t.theme, THEMES)),
    check('users_username_lowered_check', sql`${t.username} = lower(${t.username})`),
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
   * server will not serve it until then.
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
