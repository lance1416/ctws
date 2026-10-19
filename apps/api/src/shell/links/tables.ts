import { OBJECT_TYPES, type ObjectType, type WorkspaceId } from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import { check, index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { inList } from '../../platform/db/sql'
import { workspaces } from '../auth/tables'

/** What the edge table could hold; the checks below keep the table as the last release made it. */
const LEGACY_LINK_KINDS = ['belongs', 'attends', 'recommends', 'about'] as const

/**
 * The edge table of the last release, read by nothing: 0030 moved `about` into `relations` and
 * 0038 made the other kinds the modules' own fields. It stays until the cleanup release so the
 * migration report can count what was moved against what was there (RFC-001 3.1), and is dropped
 * once the report is marked Done.
 */
export const links = pgTable(
  'links',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id')
      .$type<WorkspaceId>()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    fromType: text('from_type').$type<ObjectType>().notNull(),
    fromId: uuid('from_id').notNull(),
    toType: text('to_type').$type<ObjectType>().notNull(),
    toId: uuid('to_id').notNull(),
    kind: text('kind').$type<(typeof LEGACY_LINK_KINDS)[number]>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('links_edge_key').on(t.fromType, t.fromId, t.toType, t.toId, t.kind),
    index('links_to_idx').on(t.workspaceId, t.toType, t.toId),
    check('links_type_check', inList(t.fromType, OBJECT_TYPES)),
    check('links_to_type_check', inList(t.toType, OBJECT_TYPES)),
    check('links_kind_check', inList(t.kind, LEGACY_LINK_KINDS)),
    check('links_not_self', sql`not (${t.fromType} = ${t.toType} and ${t.fromId} = ${t.toId})`),
  ],
)
