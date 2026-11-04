import type { ObjectType, WorkspaceId } from '@ctws/contracts'
import { pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { workspaces } from '../auth/tables'

/**
 * "Not this one": a place a thing was named that is about something else ("Atlas" the book, not
 * the project), by the thing, the text it is in, and its sentence. Not listed again.
 */
export const unlinkedDismissed = pgTable(
  'unlinked_dismissed',
  {
    workspaceId: uuid('workspace_id')
      .$type<WorkspaceId>()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    targetType: text('target_type').$type<ObjectType>().notNull(),
    targetId: uuid('target_id').notNull(),
    sourceType: text('source_type').$type<ObjectType>().notNull(),
    sourceId: uuid('source_id').notNull(),
    excerpt: text('excerpt').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.targetType, t.targetId, t.sourceType, t.sourceId, t.excerpt] })],
)
