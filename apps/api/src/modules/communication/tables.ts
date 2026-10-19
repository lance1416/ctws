import {
  CHANNELS,
  type Channel,
  type CommunicationId,
  DIRECTIONS,
  type Direction,
  type ProjectId,
  type WorkspaceId,
} from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { inList } from '../../platform/db/sql'
import { workspaceKeys } from '../../shell/auth'
import { projectKeys } from '../../shell/projects'

/** One exchange logged by hand (FR-048). Deleted outright: its tombstone is what remains. */
export const communications = pgTable(
  'communications',
  {
    id: uuid('id').$type<CommunicationId>().primaryKey(),
    workspaceId: uuid('workspace_id')
      .$type<WorkspaceId>()
      .notNull()
      .references(() => workspaceKeys.id, { onDelete: 'cascade' }),
    direction: text('direction').$type<Direction>().notNull(),
    channel: text('channel').$type<Channel>().notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    subject: text('subject'),
    body: text('body'),
    projectId: uuid('project_id').$type<ProjectId>(),
    /** Links attached, as given. */
    attachments: jsonb('attachments').$type<string[]>().notNull().default([]),
    /** A sent one may wait for a reply by a day (FR-048); logging the reply points `replied_by` at it. */
    awaitingReply: boolean('awaiting_reply').notNull().default(false),
    followUpOn: date('follow_up_on'),
    repliedBy: uuid('replied_by').$type<CommunicationId>(),
    /** The sent message a received one answered. */
    replyTo: uuid('reply_to').$type<CommunicationId>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('communications_workspace_occurred_idx').on(t.workspaceId, t.occurredAt.desc()),
    index('communications_awaiting_idx')
      .on(t.workspaceId, t.followUpOn)
      .where(sql`${t.awaitingReply} and ${t.repliedBy} is null`),
    check('communications_direction_check', inList(t.direction, DIRECTIONS)),
    check('communications_channel_check', inList(t.channel, CHANNELS)),
    check('communications_awaiting_check', sql`not ${t.awaitingReply} or ${t.direction} = 'sent'`),
    foreignKey({
      name: 'communications_project_fk',
      columns: [t.workspaceId, t.projectId],
      foreignColumns: [projectKeys.workspaceId, projectKeys.id],
    }).onDelete('set null'),
  ],
)

export type Communication = typeof communications.$inferSelect

/** Who an exchange was with: people and organisations, named by type and id, no foreign key. */
export const communicationParties = pgTable(
  'communication_parties',
  {
    communicationId: uuid('communication_id')
      .$type<CommunicationId>()
      .notNull()
      .references(() => communications.id, { onDelete: 'cascade' }),
    partyType: text('party_type').$type<'person' | 'organisation'>().notNull(),
    partyId: uuid('party_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.communicationId, t.partyType, t.partyId] }),
    index('communication_parties_party_idx').on(t.partyType, t.partyId),
    check('communication_parties_type_check', inList(t.partyType, ['person', 'organisation'])),
  ],
)
