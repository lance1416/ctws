import { OBJECT_TYPES, type ObjectType, type WorkspaceId } from '@ctws/contracts'
import { check, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { inList } from '../../platform/db/sql'
import { workspaces } from '../auth/tables'

/**
 * What happened to a thing: every kind of thing has a log here (FR-044). A row names the thing by
 * type and id rather than by a foreign key, since there is no one table to point at; a thing's
 * rows are deleted with it, and its tombstone is what remains (FR-032).
 *
 * Ids are time-ordered (uuid v7), so `(occurred_at, id)` is the order rows were written in; a
 * command's events share its instant.
 */
export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id')
      .$type<WorkspaceId>()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    objectType: text('object_type').$type<ObjectType>().notNull(),
    objectId: uuid('object_id').notNull(),
    type: text('type').notNull(),
    payload: jsonb('payload').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('events_workspace_occurred_idx').on(t.workspaceId, t.occurredAt.desc()),
    index('events_object_occurred_idx').on(t.objectType, t.objectId, t.occurredAt.desc()),
    check('events_object_type_check', inList(t.objectType, OBJECT_TYPES)),
  ],
)

export type Event = typeof events.$inferSelect
