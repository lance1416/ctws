import {
  NOTE_ANCHOR_TYPES,
  type NoteFolderId,
  type NoteId,
  type WorkspaceId,
} from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { inList } from '../../platform/db/sql'
import { workspaceKeys } from '../../shell/auth'

/**
 * A folder of notes (REQ-002 FR-110, FR-117): up to three deep, its name its own among the folders
 * beside it, open or closed in the sidebar as it was left. Deleting one moves what is in it up a
 * level first (`deleteFolder`); the parent's own `on delete set null` is only a backstop.
 */
export const noteFolders = pgTable(
  'note_folders',
  {
    id: uuid('id').$type<NoteFolderId>().primaryKey(),
    workspaceId: uuid('workspace_id')
      .$type<WorkspaceId>()
      .notNull()
      .references(() => workspaceKeys.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id')
      .$type<NoteFolderId>()
      .references((): AnyPgColumn => noteFolders.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    open: boolean('open').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // At the top, where there is no parent, the names are each other's too: nulls not distinct.
  (t) => [
    unique('note_folders_parent_name_key').on(t.workspaceId, t.parentId, t.name).nullsNotDistinct(),
  ],
)

export type NoteFolder = typeof noteFolders.$inferSelect

/**
 * A note (FR-050): Markdown on its own or hung on another thing, named by type and id with no
 * foreign key. A note on one occurrence of a meeting names the occurrence's local time.
 */
export const notes = pgTable(
  'notes',
  {
    id: uuid('id').$type<NoteId>().primaryKey(),
    workspaceId: uuid('workspace_id')
      .$type<WorkspaceId>()
      .notNull()
      .references(() => workspaceKeys.id, { onDelete: 'cascade' }),
    title: text('title'),
    body: text('body').notNull(),
    anchorType: text('anchor_type').$type<(typeof NOTE_ANCHOR_TYPES)[number]>(),
    anchorId: uuid('anchor_id'),
    occurrenceId: text('occurrence_id'),
    /**
     * The instant of the occurrence a note was hung on (FR-050): a meeting note is about that day,
     * whenever it was written, and keeps the day after the meeting is gone.
     */
    heldAt: timestamp('held_at', { withTimezone: true }),
    /** Its folder, a note on its own only (FR-110); a folder deleted leaves its notes in none. */
    folderId: uuid('folder_id')
      .$type<NoteFolderId>()
      .references(() => noteFolders.id, { onDelete: 'set null' }),
    /** When it was pinned to the top of the list, a note on its own only (FR-110). */
    pinnedAt: timestamp('pinned_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('notes_workspace_updated_idx').on(t.workspaceId, t.updatedAt.desc()),
    index('notes_anchor_idx').on(t.workspaceId, t.anchorType, t.anchorId),
    index('notes_folder_idx').on(t.folderId),
    check('notes_anchor_type_check', inList(t.anchorType, NOTE_ANCHOR_TYPES)),
    check(
      'notes_shelved_on_its_own',
      sql`${t.anchorType} is null or (${t.folderId} is null and ${t.pinnedAt} is null)`,
    ),
    check(
      'notes_anchor_shape',
      sql`(${t.anchorType} is null and ${t.anchorId} is null and ${t.occurrenceId} is null)
          or (${t.anchorType} is not null and ${t.anchorId} is not null
              and (${t.occurrenceId} is null or ${t.anchorType} = 'meeting'))`,
    ),
  ],
)

export type Note = typeof notes.$inferSelect
