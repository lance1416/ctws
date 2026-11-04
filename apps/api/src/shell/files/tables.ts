import type { FileId, UndoToken, WorkspaceId } from '@ctws/contracts'
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { workspaces } from '../auth/tables'

/**
 * A file kept in the object store: which workspace it belongs to, which is what lets one be read,
 * and its key there. The bytes are only in the store; a row is what makes a file exist here.
 */
export const files = pgTable(
  'files',
  {
    id: uuid('id').$type<FileId>().primaryKey(),
    workspaceId: uuid('workspace_id')
      .$type<WorkspaceId>()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('files_workspace_idx').on(t.workspaceId)],
)

/**
 * Files on their way out, each from `dueAt`: a sweep removes the bytes, then the file's row,
 * which takes this one with it. Writing here in the transaction that lets go of a file is what
 * keeps the store and the database in step: a rollback leaves the file, a failed removal is
 * tried again next sweep. A photo taken off by hand waits a minute first, and the row's id is the
 * token that puts it back; `ownerId` is who it may be put back on.
 */
export const fileDeletes = pgTable(
  'file_deletes',
  {
    id: uuid('id').$type<UndoToken>().primaryKey(),
    fileId: uuid('file_id')
      .$type<FileId>()
      .notNull()
      .unique()
      .references(() => files.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id'),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('file_deletes_due_idx').on(t.dueAt)],
)

/** What a module's table points at to hold a file. */
export const fileKeys = { id: files.id }
