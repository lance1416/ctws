import {
  OBJECT_TYPES,
  type ObjectType,
  RELATION_ORIGINS,
  type RelationId,
  type RelationOrigin,
  type WorkspaceId,
} from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { inList } from '../../platform/db/sql'
import { workspaces } from '../auth/tables'

/**
 * A relation between any two things, with no kind (FR-042). Neither end has a foreign key, since
 * there is no one table to point at; every read resolves the ends against their own tables and
 * drops what it cannot see. `from` is the end that made the relation: the thing it was added on,
 * or the thing whose text mentions the other.
 */
export const relations = pgTable(
  'relations',
  {
    id: uuid('id').$type<RelationId>().primaryKey(),
    workspaceId: uuid('workspace_id')
      .$type<WorkspaceId>()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    fromType: text('from_type').$type<ObjectType>().notNull(),
    fromId: uuid('from_id').notNull(),
    toType: text('to_type').$type<ObjectType>().notNull(),
    toId: uuid('to_id').notNull(),
    origin: text('origin').$type<RelationOrigin>().notNull(),
    /** By hand: the optional line of why. */
    note: text('note'),
    /** By mention: which field of `from` holds the text, and the sentence in it. */
    field: text('field'),
    excerpt: text('excerpt'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One by hand per pair; by mention, one per sentence that mentions.
    uniqueIndex('relations_edge_key').on(
      t.fromType,
      t.fromId,
      t.toType,
      t.toId,
      t.origin,
      sql`coalesce(${t.excerpt}, '')`,
    ),
    index('relations_to_idx').on(t.workspaceId, t.toType, t.toId),
    index('relations_from_idx').on(t.workspaceId, t.fromType, t.fromId),
    check('relations_from_type_check', inList(t.fromType, OBJECT_TYPES)),
    check('relations_to_type_check', inList(t.toType, OBJECT_TYPES)),
    check('relations_origin_check', inList(t.origin, RELATION_ORIGINS)),
    check('relations_not_self', sql`not (${t.fromType} = ${t.toType} and ${t.fromId} = ${t.toId})`),
    // A mention says where it was found; a relation made by hand has no excerpt.
    check(
      'relations_origin_shape',
      sql`(${t.origin} = 'mention' and ${t.field} is not null and ${t.excerpt} is not null)
          or (${t.origin} = 'manual' and ${t.field} is null and ${t.excerpt} is null)`,
    ),
  ],
)

export type Relation = typeof relations.$inferSelect
