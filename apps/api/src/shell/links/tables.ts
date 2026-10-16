import { LINK_KINDS, OBJECT_TYPES } from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import { check, index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { inList } from '../../platform/db/sql'
import { workspaces } from '../auth/tables'

/**
 * An edge between any two things. Neither end has a foreign key, since there is no one table to
 * point at; every read resolves the ends against their own tables and drops what it cannot see.
 */
export const links = pgTable(
  'links',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    fromType: text('from_type').notNull(),
    fromId: uuid('from_id').notNull(),
    toType: text('to_type').notNull(),
    toId: uuid('to_id').notNull(),
    kind: text('kind').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.fromType, t.fromId, t.toType, t.toId, t.kind] }),
    index('links_to_idx').on(t.workspaceId, t.toType, t.toId),
    check('links_type_check', inList(t.fromType, OBJECT_TYPES)),
    check('links_to_type_check', inList(t.toType, OBJECT_TYPES)),
    check(
      'links_kind_check',
      inList(
        t.kind,
        LINK_KINDS.map((l) => l.kind),
      ),
    ),
    check('links_not_self', sql`not (${t.fromType} = ${t.toType} and ${t.fromId} = ${t.toId})`),
  ],
)
