import {
  LINK_KINDS,
  type LinkedObject,
  type LinkKind,
  type LinksResponse,
  type ObjectType,
} from '@ctws/contracts'
import { and, eq, or } from 'drizzle-orm'
import type { Queryable } from '../db/client'
import { links } from '../db/schema'
import type { Endpoint } from './store'
import type { StoredEdge } from './linkable'
import { LINKABLES, linkableFor, TYPE_ORDER } from './registry'

/**
 * EVERYTHING ONE THING IS CONNECTED TO -- the shell's read, and the whole point of the edge table.
 *
 * Read in BOTH directions, because an edge is one fact: 「这个会有谁参加」 and 「我跟这个人开过哪些会」
 * are the same row, and neither side has to be kept in step with the other. The reading side is
 * where that pays off -- nothing was written on the person's record, and their page still shows
 * the meeting.
 */

/** How many of one kind of thing a page shows before it stops. A personal workbench, not a CRM. */
const PER_GROUP = 200

const kindOf = new Map(LINK_KINDS.map((k) => [k.kind as LinkKind, k]))

/** The phrase for an edge read FROM the object whose page this is. */
function phrase(kind: LinkKind, outgoing: boolean): string {
  const rule = kindOf.get(kind)
  if (!rule) return ''
  return outgoing ? rule.label : rule.inverse
}

async function storedEdges(q: Queryable, workspaceId: string, of: Endpoint): Promise<StoredEdge[]> {
  const rows = await q
    .select({
      fromType: links.fromType,
      fromId: links.fromId,
      toType: links.toType,
      toId: links.toId,
      kind: links.kind,
    })
    .from(links)
    .where(
      and(
        eq(links.workspaceId, workspaceId),
        or(
          and(eq(links.fromType, of.type), eq(links.fromId, of.id)),
          and(eq(links.toType, of.type), eq(links.toId, of.id)),
        ),
      ),
    )
  return rows as StoredEdge[]
}

export async function linksOf(
  q: Queryable,
  workspaceId: string,
  of: Endpoint,
): Promise<LinksResponse> {
  // The edge table plus whatever each module stores itself. One round of queries, not one per
  // edge: a module that stores nothing of its own costs nothing here.
  const [stored, ...own] = await Promise.all([
    storedEdges(q, workspaceId, of),
    ...LINKABLES.filter((l) => l.own).map((l) => l.own!(q, workspaceId, of)),
  ])
  const edges = [...stored, ...own.flat()]

  // The far end of each edge, by type, so each module is asked ONCE for the whole page.
  const wanted = new Map<ObjectType, Set<string>>()
  const far = (e: StoredEdge) =>
    e.fromType === of.type && e.fromId === of.id
      ? ({ type: e.toType, id: e.toId, outgoing: true } as const)
      : ({ type: e.fromType, id: e.fromId, outgoing: false } as const)
  for (const edge of edges) {
    const end = far(edge)
    const set = wanted.get(end.type)
    if (set) set.add(end.id)
    else wanted.set(end.type, new Set([end.id]))
  }
  const named = new Map<ObjectType, Map<string, { title: string; detail: string | null }>>()
  await Promise.all(
    [...wanted].map(async ([type, ids]) => {
      named.set(type, await linkableFor(type).name(q, workspaceId, [...ids]))
    }),
  )

  const groups = new Map<ObjectType, LinkedObject[]>()
  const seen = new Set<string>()
  for (const edge of edges) {
    const end = far(edge)
    // An edge whose far end did not come back points at something soft-deleted or in another
    // workspace. Dropped rather than drawn blank -- the same answer every list in this app gives.
    const name = named.get(end.type)?.get(end.id)
    if (!name) continue
    // One row per thing per kind: two edges of the same kind between the same pair is the same
    // fact twice, which `links`' primary key already refuses and a module's own edges might not.
    const key = `${end.type}:${end.id}:${edge.kind}:${end.outgoing}`
    if (seen.has(key)) continue
    seen.add(key)
    const list = groups.get(end.type) ?? []
    list.push({
      type: end.type,
      id: end.id,
      title: name.title,
      detail: name.detail,
      kind: edge.kind,
      label: phrase(edge.kind, end.outgoing),
      outgoing: end.outgoing,
    })
    groups.set(end.type, list)
  }

  return {
    groups: TYPE_ORDER.filter((type) => groups.has(type)).map((type) => ({
      label: linkableFor(type).label,
      type,
      items: groups
        .get(type)!
        // By title: a group is read to FIND something in it, and the order edges were made in is
        // not an order anybody remembers. Compared by CODE POINT, not by locale: every other list
        // in this app is ordered by the database, and a second collation here would mean the same
        // two names read in one order on a project page and the other in 联系人.
        .sort((a, b) => (a.title < b.title ? -1 : a.title > b.title ? 1 : a.id < b.id ? -1 : 1))
        .slice(0, PER_GROUP),
    })),
  }
}

/** Whether a thing exists and this workspace may see it -- both ends of a write go through here. */
export async function exists(q: Queryable, workspaceId: string, end: Endpoint): Promise<boolean> {
  const named = await linkableFor(end.type).name(q, workspaceId, [end.id])
  return named.has(end.id)
}
