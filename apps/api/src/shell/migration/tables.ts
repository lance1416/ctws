import type { MigrationItem, WorkspaceId } from '@ctws/contracts'
import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { workspaces } from '../auth/tables'

/** What was counted on the way in and out, and what went where. */
export type MigrationCounts = {
  before: Record<string, number>
  after: Record<string, number>
  moved: Record<string, number>
}

/**
 * One row per workspace moved to the new layout (RFC-001 3.3): when, from which backup, the
 * counts, and the guesses to look at. Its presence is what makes the move idempotent.
 */
export const migrationReports = pgTable('migration_reports', {
  workspaceId: uuid('workspace_id')
    .$type<WorkspaceId>()
    .primaryKey()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  ranAt: timestamp('ran_at', { withTimezone: true }).notNull(),
  backupRef: text('backup_ref').notNull(),
  backupBytes: text('backup_bytes').notNull(),
  counts: jsonb('counts').$type<MigrationCounts>().notNull(),
  items: jsonb('items').$type<MigrationItem[]>().notNull(),
  doneAt: timestamp('done_at', { withTimezone: true }),
})
