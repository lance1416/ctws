import {
  OBJECT_TYPES,
  PREVIEW_STATES,
  type FileId,
  type ObjectType,
  type PreviewState,
  type ResourceId,
  type WorkspaceId,
} from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { inList } from '../../platform/db/sql'
import { workspaces } from '../auth/tables'
import { files } from '../files/tables'

/**
 * An outside address a thing carries. The owner is named by type and id, with no foreign
 * key, since there is no one table to point at; a thing's resources are deleted with it.
 */
export const resources = pgTable(
  'resources',
  {
    id: uuid('id').$type<ResourceId>().primaryKey(),
    workspaceId: uuid('workspace_id')
      .$type<WorkspaceId>()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ownerType: text('owner_type').$type<ObjectType>().notNull(),
    ownerId: uuid('owner_id').notNull(),
    url: text('url').notNull(),
    name: text('name'),
    // COLLATE "C" is added in the migration SQL; (rank, id) is the order among the owner's.
    rank: text('rank').notNull(),
    /** For a project's resources only: its place in the head, 1 to 9, or null when not pinned. */
    pinnedRank: integer('pinned_rank'),
    /**
     * Its card, as the page it points at describes itself: fetched in the background, so a new
     * one is `pending` until then, and `none` when the page gave nothing or fetching is off.
     */
    previewState: text('preview_state').$type<PreviewState>().notNull().default('pending'),
    previewTitle: text('preview_title'),
    previewSite: text('preview_site'),
    /** Its icon and picture, fetched and made anew; the files go with the resource. */
    iconId: uuid('icon_id')
      .$type<FileId>()
      .references(() => files.id, { onDelete: 'set null' }),
    imageId: uuid('image_id')
      .$type<FileId>()
      .references(() => files.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('resources_owner_idx').on(t.workspaceId, t.ownerType, t.ownerId),
    // One resource per digit key within a project.
    uniqueIndex('resources_pinned_key')
      .on(t.ownerType, t.ownerId, t.pinnedRank)
      .where(sql`${t.pinnedRank} is not null`),
    check('resources_owner_type_check', inList(t.ownerType, OBJECT_TYPES)),
    check('resources_preview_state_check', inList(t.previewState, PREVIEW_STATES)),
    index('resources_preview_pending_idx')
      .on(t.previewState)
      .where(sql`${t.previewState} = 'pending'`),
    check(
      'resources_pinned_check',
      sql`${t.pinnedRank} is null or (${t.ownerType} = 'project' and ${t.pinnedRank} between 1 and 9)`,
    ),
  ],
)

export type Resource = typeof resources.$inferSelect
