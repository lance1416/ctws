import {
  type LinkEdge,
  type LinkId,
  linkId,
  type LinkKind,
  type ObjectType,
  type WorkspaceId,
} from '@ctws/contracts'
import { and, eq, inArray, notInArray } from 'drizzle-orm'
import type { Queryable, Tx } from '../../platform/db/client'
import { newId } from '../../platform/db/ids'
import { type Actor, scoped, within } from '../../platform/db/scope'
import { NotFound } from '../../platform/errors'
import { links } from './tables'

/** One end of an edge. */
export type Endpoint = { type: ObjectType; id: string }

/** One kind of edge leaving one object, toward one type: an allowed edge without its far end. */
type EdgesFrom = LinkEdge extends infer Edge
  ? Edge extends LinkEdge
    ? { kind: Edge['kind']; from: Edge['from']; toType: Edge['to']['type'] }
    : never
  : never

/** An edge as stored: its id, both ends and its kind. Read back, it may be one the model now refuses. */
export type StoredLink = { id: LinkId; from: Endpoint; to: Endpoint; kind: LinkKind }

const linkColumns = {
  id: links.id,
  fromType: links.fromType,
  fromId: links.fromId,
  toType: links.toType,
  toId: links.toId,
  kind: links.kind,
}

const storedOf = (r: {
  id: LinkId
  fromType: ObjectType
  fromId: string
  toType: ObjectType
  toId: string
  kind: LinkKind
}): StoredLink => ({
  id: r.id,
  from: { type: r.fromType, id: r.fromId },
  to: { type: r.toType, id: r.toId },
  kind: r.kind,
})

/**
 * Makes `toIds` the whole set of one kind of edge leaving an object, inside the caller's
 * transaction. The delete names both the far type and the kind, so writing one relationship
 * leaves the others; an edge that stays keeps its id.
 */
export async function putLinks(
  q: Tx,
  { workspaceId, now, from, toType, kind, toIds }: Actor & EdgesFrom & { toIds: readonly string[] },
): Promise<void> {
  const wanted = [...new Set(toIds)]
  await q
    .delete(links)
    .where(
      within(
        scoped(links, workspaceId),
        eq(links.fromType, from.type),
        eq(links.fromId, from.id),
        eq(links.toType, toType),
        eq(links.kind, kind),
        wanted.length > 0 ? notInArray(links.toId, wanted) : undefined,
      ),
    )
  if (wanted.length === 0) return
  await q
    .insert(links)
    .values(
      wanted.map((toId) => ({
        id: newId(linkId),
        workspaceId,
        fromType: from.type,
        fromId: from.id,
        toType,
        toId,
        kind,
        createdAt: now,
      })),
    )
    .onConflictDoNothing()
}

/**
 * The edges of one kind from some objects of one type to things of another, in one query: which
 * of those objects points at what. Whether the far ends are visible is the caller's to check.
 */
export async function edgesFrom(
  q: Queryable,
  workspaceId: WorkspaceId,
  {
    fromType,
    fromIds,
    toType,
    kind,
  }: { fromType: ObjectType; fromIds: readonly string[]; toType: ObjectType; kind: LinkKind },
): Promise<{ fromId: string; toId: string }[]> {
  if (fromIds.length === 0) return []
  return q
    .select({ fromId: links.fromId, toId: links.toId })
    .from(links)
    .where(
      within(
        scoped(links, workspaceId),
        eq(links.fromType, fromType),
        inArray(links.fromId, [...fromIds]),
        eq(links.toType, toType),
        eq(links.kind, kind),
      ),
    )
}

/** One link in this workspace; another workspace's reads as not found. */
export async function getLink(
  q: Queryable,
  workspaceId: WorkspaceId,
  id: LinkId,
): Promise<StoredLink> {
  const [row] = await q
    .select(linkColumns)
    .from(links)
    .where(within(scoped(links, workspaceId), eq(links.id, id)))
  if (!row) throw new NotFound('Link')
  return storedOf(row)
}

/**
 * Adds one edge. One that is already there is the state asked for: it is answered with, and
 * `created` says which.
 */
export async function addLink(
  q: Queryable,
  { workspaceId, now, from, to, kind }: Actor & LinkEdge,
): Promise<{ link: StoredLink; created: boolean }> {
  const [added] = await q
    .insert(links)
    .values({
      id: newId(linkId),
      workspaceId,
      fromType: from.type,
      fromId: from.id,
      toType: to.type,
      toId: to.id,
      kind,
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning(linkColumns)
  if (added) return { link: storedOf(added), created: true }
  const [there] = await q
    .select(linkColumns)
    .from(links)
    .where(
      and(
        eq(links.fromType, from.type),
        eq(links.fromId, from.id),
        eq(links.toType, to.type),
        eq(links.toId, to.id),
        eq(links.kind, kind),
      ),
    )
  return { link: storedOf(there!), created: false }
}

/** Removes one link. Not checked against the model: a link it now refuses can still go. */
export async function removeLink(
  q: Queryable,
  { workspaceId, id }: { workspaceId: WorkspaceId; id: LinkId },
): Promise<void> {
  const removed = await q
    .delete(links)
    .where(within(scoped(links, workspaceId), eq(links.id, id)))
    .returning({ id: links.id })
  if (removed.length === 0) throw new NotFound('Link')
}
