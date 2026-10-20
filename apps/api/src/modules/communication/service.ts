import {
  type CommunicationId,
  communicationId,
  type CreateCommunicationBody,
  FOLLOW_UP_DAYS,
  type Party,
  type UpdateCommunicationBody,
} from '@ctws/contracts'
import { addDays, dayIn } from '@ctws/core'
import { eq } from 'drizzle-orm'
import type { Db, Tx } from '../../platform/db/client'
import { newId } from '../../platform/db/ids'
import { DomainError } from '../../platform/errors'
import { replaceRows } from '../../platform/db/replace'
import type { Actor } from '../../platform/db/scope'
import { eventLog } from '../../shell/events'
import { bury } from '../../shell/tombstones'
import type { LinkRegistry } from '../../shell/links'
import { assertProjectsVisible } from '../../shell/projects'
import { syncMentions } from '../../shell/relations'
import { getCommunication, lockCommunication, type CommunicationRow } from './queries'
import { type Communication, communicationParties, communications } from './tables'

const subject = (id: CommunicationId) => ({ type: 'communication' as const, id })

/** A reply to a message that was not sent, or that was answered already. */
class NotAwaiting extends DomainError {
  constructor() {
    super('conflict', { detail: 'only a sent message still waiting can be answered' })
  }
}

/** Every party of the message has since been deleted: there is nobody to answer (FR-048). */
class NoOneLeft extends DomainError {
  constructor() {
    super('conflict', { detail: 'no one is left on this message to reply' })
  }
}

/** Every party is a person or organisation this workspace can see. */
async function assertPartiesVisible(
  registry: LinkRegistry,
  tx: Tx,
  ctx: Actor,
  parties: readonly Party[],
): Promise<void> {
  for (const type of ['person', 'organisation'] as const) {
    const ids = [...new Set(parties.filter((p) => p.type === type).map((p) => p.id))]
    if (ids.length === 0) continue
    const rows = await registry.of(type).rows(tx, ctx.workspaceId, { ids, limit: ids.length })
    if (rows.length !== ids.length)
      throw new DomainError('not-found', { detail: `${type} not found` })
  }
}

async function putParties(tx: Tx, id: CommunicationId, parties: readonly Party[]): Promise<void> {
  const seen = new Set<string>()
  const rows = parties
    .filter((p) => {
      const key = `${p.type}:${p.id}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map((p) => ({ communicationId: id, partyType: p.type, partyId: p.id }))
  await replaceRows(tx, communicationParties, eq(communicationParties.communicationId, id), rows)
}

/** The follow-up day a sent message takes when it waits and none is given: five days on. */
const defaultFollowUp = (occurredAt: Date, zone: string): string =>
  addDays(dayIn(occurredAt, zone), FOLLOW_UP_DAYS)

export async function createCommunication(
  registry: LinkRegistry,
  db: Db,
  ctx: Actor,
  zone: string,
  body: CreateCommunicationBody,
): Promise<CommunicationRow> {
  return db.transaction(async (tx) => {
    await assertPartiesVisible(registry, tx, ctx, body.parties)
    if (body.projectId) await assertProjectsVisible(tx, ctx.workspaceId, [body.projectId])
    const occurredAt = body.occurredAt ? new Date(body.occurredAt) : ctx.now
    const awaiting = body.awaitingReply ?? false
    const [row] = await tx
      .insert(communications)
      .values({
        id: newId(communicationId),
        workspaceId: ctx.workspaceId,
        direction: body.direction,
        channel: body.channel,
        occurredAt,
        subject: body.subject ?? null,
        body: body.body ?? null,
        projectId: body.projectId ?? null,
        attachments: body.attachments ?? [],
        awaitingReply: awaiting,
        followUpOn: awaiting ? (body.followUpOn ?? defaultFollowUp(occurredAt, zone)) : null,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      })
      .returning()
    await putParties(tx, row!.id, body.parties)
    await eventLog(tx, ctx).append(subject(row!.id), 'created', {
      to: { direction: row!.direction, channel: row!.channel, subject: row!.subject },
    })
    if (row!.body) await syncMentions(tx, ctx, subject(row!.id), 'body', row!.body)
    return getCommunication(tx, ctx.workspaceId, row!.id)
  })
}

export async function updateCommunication(
  registry: LinkRegistry,
  db: Db,
  ctx: Actor,
  zone: string,
  id: CommunicationId,
  patch: UpdateCommunicationBody,
): Promise<CommunicationRow> {
  return db.transaction(async (tx) => {
    const row = await lockCommunication(tx, ctx.workspaceId, id)
    if (patch.parties) await assertPartiesVisible(registry, tx, ctx, patch.parties)
    if (patch.projectId) await assertProjectsVisible(tx, ctx.workspaceId, [patch.projectId])
    const log = eventLog(tx, ctx)
    const set: Partial<Communication> = {}
    const fields = ['direction', 'channel', 'subject', 'body', 'projectId', 'followUpOn'] as const
    for (const field of fields) {
      const next = patch[field]
      if (next !== undefined && next !== row[field]) {
        ;(set as Record<string, unknown>)[field] = next
        await log.append(subject(id), 'field_changed', { field, from: row[field], to: next })
      }
    }
    if (patch.occurredAt !== undefined) {
      const next = new Date(patch.occurredAt)
      if (next.getTime() !== row.occurredAt.getTime()) {
        set.occurredAt = next
        await log.append(subject(id), 'field_changed', {
          field: 'occurredAt',
          from: row.occurredAt.toISOString(),
          to: next.toISOString(),
        })
      }
    }
    if (patch.attachments !== undefined) set.attachments = patch.attachments
    const direction = set.direction ?? row.direction
    if (patch.awaitingReply !== undefined && patch.awaitingReply !== row.awaitingReply) {
      if (patch.awaitingReply && direction !== 'sent') {
        throw new DomainError('unprocessable', { detail: 'only a sent message waits for a reply' })
      }
      set.awaitingReply = patch.awaitingReply
      if (patch.awaitingReply && set.followUpOn === undefined && row.followUpOn === null) {
        set.followUpOn = defaultFollowUp(set.occurredAt ?? row.occurredAt, zone)
      }
      if (!patch.awaitingReply) set.followUpOn = null
      await log.append(subject(id), 'field_changed', {
        field: 'awaitingReply',
        from: row.awaitingReply,
        to: patch.awaitingReply,
      })
    }
    if (Object.keys(set).length > 0) {
      await tx
        .update(communications)
        .set({ ...set, updatedAt: ctx.now })
        .where(eq(communications.id, id))
    }
    if (patch.parties) await putParties(tx, id, patch.parties)
    if (set.body !== undefined) await syncMentions(tx, ctx, subject(id), 'body', set.body)
    return getCommunication(tx, ctx.workspaceId, id)
  })
}

/**
 * "Log the reply" (FR-048): a received message from the same parties, which answers the sent one
 * and closes its wait. The answer is the new message.
 */
export async function logReply(
  db: Db,
  ctx: Actor,
  id: CommunicationId,
  body: {
    channel?: Communication['channel'] | undefined
    occurredAt?: string | undefined
    subject?: string | null | undefined
    body?: string | null | undefined
    attachments?: string[] | undefined
  },
): Promise<CommunicationRow> {
  return db.transaction(async (tx) => {
    const sent = await getCommunication(tx, ctx.workspaceId, id)
    if (sent.direction !== 'sent' || sent.repliedBy !== null) throw new NotAwaiting()
    if (sent.parties.length === 0) throw new NoOneLeft()
    const [reply] = await tx
      .insert(communications)
      .values({
        id: newId(communicationId),
        workspaceId: ctx.workspaceId,
        direction: 'received',
        channel: body.channel ?? sent.channel,
        occurredAt: body.occurredAt ? new Date(body.occurredAt) : ctx.now,
        subject: body.subject === undefined ? sent.subject : body.subject,
        body: body.body ?? null,
        projectId: sent.projectId,
        attachments: body.attachments ?? [],
        awaitingReply: false,
        followUpOn: null,
        replyTo: sent.id,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      })
      .returning()
    await putParties(tx, reply!.id, sent.parties)
    await tx
      .update(communications)
      .set({ repliedBy: reply!.id, awaitingReply: false, updatedAt: ctx.now })
      .where(eq(communications.id, sent.id))
    const log = eventLog(tx, ctx)
    await log.append(subject(reply!.id), 'created', {
      to: { direction: 'received', channel: reply!.channel, subject: reply!.subject },
    })
    await log.append(subject(sent.id), 'replied', { by: reply!.id })
    if (reply!.body) await syncMentions(tx, ctx, subject(reply!.id), 'body', reply!.body)
    return getCommunication(tx, ctx.workspaceId, reply!.id)
  })
}

/** Deletes a communication outright; a reply that answered it leaves the sent one open again. */
export async function deleteCommunication(db: Db, ctx: Actor, id: CommunicationId): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await lockCommunication(tx, ctx.workspaceId, id)
    if (row.replyTo) {
      await tx
        .update(communications)
        .set({ repliedBy: null, updatedAt: ctx.now })
        .where(eq(communications.id, row.replyTo))
    }
    await bury(tx, ctx, [
      {
        type: 'communication',
        id,
        title: row.subject ?? (row.body ? row.body.slice(0, 80) : row.channel),
        place: { projectId: row.projectId },
      },
    ])
    await tx.delete(communications).where(eq(communications.id, row.id))
  })
}
