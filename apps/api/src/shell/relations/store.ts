import {
  type ObjectType,
  type RelationId,
  relationId,
  type RelationResponse,
  type WorkspaceId,
} from '@ctws/contracts'
import { mentionsIn } from '@ctws/core'
import { and, eq, inArray, or } from 'drizzle-orm'
import type { Queryable, Tx } from '../../platform/db/client'
import { newId } from '../../platform/db/ids'
import { NotFound } from '../../platform/errors'
import { type Actor, scoped, within } from '../../platform/db/scope'
import { eventLog } from '../events'
import { type Relation, relations } from './tables'

/** One end of a relation. */
export type Endpoint = { type: ObjectType; id: string }

export const toRelationResponse = (r: Relation): RelationResponse => ({
  id: r.id,
  from: { type: r.fromType, id: r.fromId },
  to: { type: r.toType, id: r.toId },
  origin: r.origin,
  note: r.note,
  excerpt: r.excerpt,
  createdAt: r.createdAt.toISOString(),
})

/** Both ends hear about a relation coming or going (FR-044). */
async function logBoth(
  tx: Tx,
  ctx: Actor,
  type: 'relation_added' | 'relation_removed',
  r: Pick<Relation, 'fromType' | 'fromId' | 'toType' | 'toId' | 'origin'>,
): Promise<void> {
  await eventLog(tx, ctx).appendAll([
    {
      subject: { type: r.fromType, id: r.fromId },
      type,
      payload: { to: { type: r.toType, id: r.toId }, origin: r.origin },
    },
    {
      subject: { type: r.toType, id: r.toId },
      type,
      payload: { to: { type: r.fromType, id: r.fromId }, origin: r.origin },
    },
  ])
}

/**
 * Relates two things by hand. One already there is the state asked for: it is answered with, its
 * note left as it was, and `created` says which. The caller has checked both ends are visible.
 */
export async function addRelation(
  tx: Tx,
  ctx: Actor,
  { from, to, note }: { from: Endpoint; to: Endpoint; note?: string | null | undefined },
): Promise<{ relation: Relation; created: boolean }> {
  // The pair may already be related from the other end: a relation has no direction (FR-042).
  const [either] = await tx
    .select()
    .from(relations)
    .where(
      within(
        scoped(relations, ctx.workspaceId),
        eq(relations.origin, 'manual'),
        or(
          and(
            eq(relations.fromType, from.type),
            eq(relations.fromId, from.id),
            eq(relations.toType, to.type),
            eq(relations.toId, to.id),
          ),
          and(
            eq(relations.fromType, to.type),
            eq(relations.fromId, to.id),
            eq(relations.toType, from.type),
            eq(relations.toId, from.id),
          ),
        ),
      ),
    )
  if (either) return { relation: either, created: false }
  const [added] = await tx
    .insert(relations)
    .values({
      id: newId(relationId),
      workspaceId: ctx.workspaceId,
      fromType: from.type,
      fromId: from.id,
      toType: to.type,
      toId: to.id,
      origin: 'manual',
      note: note ?? null,
      createdAt: ctx.now,
    })
    .onConflictDoNothing()
    .returning()
  if (added) {
    await logBoth(tx, ctx, 'relation_added', added)
    return { relation: added, created: true }
  }
  const [there] = await tx
    .select()
    .from(relations)
    .where(
      and(
        eq(relations.fromType, from.type),
        eq(relations.fromId, from.id),
        eq(relations.toType, to.type),
        eq(relations.toId, to.id),
        eq(relations.origin, 'manual'),
      ),
    )
  return there ? { relation: there, created: false } : addRelation(tx, ctx, { from, to, note })
}

/** One relation in this workspace; another workspace's reads as not found. */
export async function getRelation(
  q: Queryable,
  workspaceId: WorkspaceId,
  id: RelationId,
): Promise<Relation> {
  const [row] = await q
    .select()
    .from(relations)
    .where(within(scoped(relations, workspaceId), eq(relations.id, id)))
  if (!row) throw new NotFound('Relation')
  return row
}

/** Changes the line of why on a relation made by hand. */
export async function noteRelation(
  tx: Tx,
  ctx: Actor,
  id: RelationId,
  note: string | null,
): Promise<Relation> {
  const row = await getRelation(tx, ctx.workspaceId, id)
  if (row.origin !== 'manual') throw new MentionIsReadOnly()
  const [updated] = await tx.update(relations).set({ note }).where(eq(relations.id, id)).returning()
  return updated!
}

/** Removes a relation made by hand. One a mention made goes when the mention does. */
export async function removeRelation(tx: Tx, ctx: Actor, id: RelationId): Promise<void> {
  const row = await getRelation(tx, ctx.workspaceId, id)
  if (row.origin !== 'manual') throw new MentionIsReadOnly()
  await tx.delete(relations).where(eq(relations.id, id))
  await logBoth(tx, ctx, 'relation_removed', row)
}

/**
 * Makes the mention relations from one field of one thing match the text it now holds (FR-042):
 * a sentence that newly mentions something adds one, a sentence that no longer does removes it.
 * Mentions of things this workspace cannot see are kept too: the read drops what it cannot
 * resolve, and a thing that comes back is related again without the text changing.
 */
export async function syncMentions(
  tx: Tx,
  ctx: Actor,
  from: Endpoint,
  field: string,
  text: string | null | undefined,
): Promise<void> {
  const wanted = mentionsIn(text).filter((m) => !(m.type === from.type && m.id === from.id))
  const have = await tx
    .select()
    .from(relations)
    .where(
      within(
        scoped(relations, ctx.workspaceId),
        eq(relations.fromType, from.type),
        eq(relations.fromId, from.id),
        eq(relations.origin, 'mention'),
        eq(relations.field, field),
      ),
    )
  const key = (m: { type: string; id: string; excerpt: string }) => `${m.type}:${m.id}:${m.excerpt}`
  const keep = new Set(wanted.map(key))
  const gone = have.filter(
    (r) => !keep.has(key({ type: r.toType, id: r.toId, excerpt: r.excerpt! })),
  )
  const had = new Set(have.map((r) => key({ type: r.toType, id: r.toId, excerpt: r.excerpt! })))
  const fresh = wanted.filter((m) => !had.has(key(m)))

  if (gone.length > 0) {
    await tx.delete(relations).where(
      inArray(
        relations.id,
        gone.map((r) => r.id),
      ),
    )
    for (const r of gone) await logBoth(tx, ctx, 'relation_removed', r)
  }
  for (const m of fresh) {
    const [added] = await tx
      .insert(relations)
      .values({
        id: newId(relationId),
        workspaceId: ctx.workspaceId,
        fromType: from.type,
        fromId: from.id,
        toType: m.type,
        toId: m.id,
        origin: 'mention',
        field,
        excerpt: m.excerpt,
        createdAt: ctx.now,
      })
      .onConflictDoNothing()
      .returning()
    if (added) await logBoth(tx, ctx, 'relation_added', added)
  }
}

/** A relation a mention made is changed by editing the text, not here. */
export class MentionIsReadOnly extends Error {
  constructor() {
    super('this link comes from a mention; edit the text instead')
  }
}
