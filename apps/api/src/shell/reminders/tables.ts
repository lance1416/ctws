import { OBJECT_TYPES, type ObjectType, type WorkspaceId } from '@ctws/contracts'
import { check, date, index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { inList } from '../../platform/db/sql'
import { workspaces } from '../auth/tables'

/**
 * A thing brought to Today on a day: one a thing, of any kind, so the shell keeps them and the
 * thing's own module never sees them. They go with the thing, in `bury`.
 */
export const reminders = pgTable(
  'reminders',
  {
    workspaceId: uuid('workspace_id')
      .$type<WorkspaceId>()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    objectType: text('object_type').$type<ObjectType>().notNull(),
    objectId: uuid('object_id').notNull(),
    /** The account's day it comes up on. */
    onDay: date('on_day').notNull(),
    why: text('why'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.objectType, t.objectId] }),
    index('reminders_workspace_day_idx').on(t.workspaceId, t.onDay),
    check('reminders_type_check', inList(t.objectType, OBJECT_TYPES)),
  ],
)
