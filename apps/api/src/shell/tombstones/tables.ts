import {
  OBJECT_TYPES,
  type ObjectType,
  type TombstonePlace,
  type WorkspaceId,
} from '@ctws/contracts'
import { check, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { inList } from '../../platform/db/sql'
import { workspaces } from '../auth/tables'

/**
 * What is left of a deleted thing (FR-035): its name, when it went and where it was, so its old
 * address still says what happened. The row itself is gone, with its log, relations and resources.
 */
export const tombstones = pgTable(
  'tombstones',
  {
    workspaceId: uuid('workspace_id')
      .$type<WorkspaceId>()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    objectType: text('object_type').$type<ObjectType>().notNull(),
    objectId: uuid('object_id').notNull(),
    title: text('title').notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }).notNull(),
    place: jsonb('place').$type<TombstonePlace>().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.objectType, t.objectId] }),
    check('tombstones_type_check', inList(t.objectType, OBJECT_TYPES)),
  ],
)
