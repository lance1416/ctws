import { type LinkKind, type ObjectType, type WorkspaceId } from '@ctws/contracts'
import { eq } from 'drizzle-orm'
import type { Queryable, Tx } from '../../platform/db/client'
import { replaceRows } from '../../platform/db/replace'
import { scoped, within } from '../../platform/db/scope'
import { links } from './tables'

/** One end of an edge. */
export type Endpoint = { type: ObjectType; id: string }

/**
 * Replaces one kind of edge leaving an object with `toIds`, inside the caller's transaction. The
 * delete names both the far type and the kind, so writing one relationship leaves the others.
 */
export async function putLinks(
  q: Tx,
  {
    workspaceId,
    from,
    toType,
    kind,
    toIds,
  }: {
    workspaceId: WorkspaceId
    from: Endpoint
    toType: ObjectType
    kind: LinkKind
    toIds: readonly string[]
  },
): Promise<void> {
  const owned = within(
    scoped(links, workspaceId),
    eq(links.fromType, from.type),
    eq(links.fromId, from.id),
    eq(links.toType, toType),
    eq(links.kind, kind),
  )
  const rows = [...new Set(toIds)].map((toId) => ({
    workspaceId,
    fromType: from.type,
    fromId: from.id,
    toType,
    toId,
    kind,
  }))
  await replaceRows(q, links, owned, rows)
}

/** One edge: both ends and the kind are its identity. */
type Edge = { workspaceId: WorkspaceId; from: Endpoint; to: Endpoint; kind: LinkKind }

/** Adds one edge; one that is already there is the state asked for. */
export async function addLink(q: Queryable, { workspaceId, from, to, kind }: Edge): Promise<void> {
  await q
    .insert(links)
    .values({
      workspaceId,
      fromType: from.type,
      fromId: from.id,
      toType: to.type,
      toId: to.id,
      kind,
    })
    .onConflictDoNothing()
}

/** Removes one edge; one that is already gone is the same answer. */
export async function removeLink(
  q: Queryable,
  { workspaceId, from, to, kind }: Edge,
): Promise<void> {
  await q
    .delete(links)
    .where(
      within(
        scoped(links, workspaceId),
        eq(links.fromType, from.type),
        eq(links.fromId, from.id),
        eq(links.toType, to.type),
        eq(links.toId, to.id),
        eq(links.kind, kind),
      ),
    )
}
