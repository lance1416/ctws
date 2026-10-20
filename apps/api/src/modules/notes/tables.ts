import { NOTE_ANCHOR_TYPES, type NoteId, type WorkspaceId } from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { inList } from '../../platform/db/sql'
import { workspaceKeys } from '../../shell/auth'

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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('notes_workspace_updated_idx').on(t.workspaceId, t.updatedAt.desc()),
    index('notes_anchor_idx').on(t.workspaceId, t.anchorType, t.anchorId),
    check('notes_anchor_type_check', inList(t.anchorType, NOTE_ANCHOR_TYPES)),
    check(
      'notes_anchor_shape',
      sql`(${t.anchorType} is null and ${t.anchorId} is null and ${t.occurrenceId} is null)
          or (${t.anchorType} is not null and ${t.anchorId} is not null
              and (${t.occurrenceId} is null or ${t.anchorType} = 'meeting'))`,
    ),
  ],
)

export type Note = typeof notes.$inferSelect
