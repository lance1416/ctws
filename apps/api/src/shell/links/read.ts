import {
  LINK_KINDS,
  type LinkCandidate,
  type LinkedObject,
  type LinkId,
  type LinkKind,
  type LinksResponse,
  type ObjectType,
  type WorkspaceId,
} from '@ctws/contracts'
import { and, eq, or } from 'drizzle-orm'
import type { Queryable } from '../../platform/db/client'
import { scoped, within } from '../../platform/db/scope'
import { links } from './tables'
import type { Endpoint } from './store'
import type { StoredEdge } from './linkable'
import type { LinkRegistry } from './registry'

/** How many of one kind of object a page shows. */
const PER_GROUP = 200

const kindOf = new Map(LINK_KINDS.map((k) => [k.kind as LinkKind, k]))

/** The phrase for an edge, read from the object whose page this is. */
function phrase(kind: LinkKind, outgoing: boolean): string {
  const rule = kindOf.get(kind)
  if (!rule) return ''
  return outgoing ? rule.label : rule.inverse
}

async function storedEdges(
  q: Queryable,
  workspaceId: WorkspaceId,
  of: Endpoint,
): Promise<(StoredEdge & { id: LinkId })[]> {
  return q
    .select({
      id: links.id,
      fromType: links.fromType,
      fromId: links.fromId,
      toType: links.toType,
      toId: links.toId,
      kind: links.kind,
    })
    .from(links)
    .where(
      within(
        scoped(links, workspaceId),
        or(
          and(eq(links.fromType, of.type), eq(links.fromId, of.id)),
          and(eq(links.toType, of.type), eq(links.toId, of.id)),
        ),
      ),
    )
}

/** Everything one object is connected to, read in both directions: an edge is one fact. */
export async function linksOf(
  registry: LinkRegistry,
  q: Queryable,
  workspaceId: WorkspaceId,
  of: Endpoint,
): Promise<LinksResponse> {
  const [stored, ...own] = await Promise.all([
    storedEdges(q, workspaceId, of),
    ...registry.all.filter((l) => l.own).map((l) => l.own!(q, workspaceId, of)),
  ])
  // Only edge-table rows can be unlinked; a task's project is a NOT NULL column.
  const edges = [...stored, ...own.flat().map((e) => ({ ...e, id: null }))]

  // The far end of each edge, by type, so each module is asked once for the whole page.
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
      const rows = await registry.of(type).rows(q, workspaceId, { ids: [...ids] })
      named.set(type, new Map(rows.map((r) => [r.id, { title: r.title, detail: r.detail }])))
    }),
  )

  const groups = new Map<ObjectType, LinkedObject[]>()
  const seen = new Set<string>()
  for (const edge of edges) {
    const end = far(edge)
    // A far end that did not come back is deleted or foreign: the edge is dropped.
    const name = named.get(end.type)?.get(end.id)
    if (!name) continue
    // One row per object, kind and direction; a module's own edges may repeat one.
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
      linkId: edge.id,
    })
    groups.set(end.type, list)
  }

  return {
    groups: registry.order
      .filter((type) => groups.has(type))
      .map((type) => ({
        label: registry.of(type).label,
        type,
        items: groups
          .get(type)!
          // By title, by code point rather than locale, so names sort as the database sorts them.
          .sort((a, b) => (a.title < b.title ? -1 : a.title > b.title ? 1 : a.id < b.id ? -1 : 1))
          .slice(0, PER_GROUP),
      })),
  }
}

/** What the picker could link to: anything but the object itself, since `about` joins any two. */
export async function candidatesFor(
  registry: LinkRegistry,
  q: Queryable,
  workspaceId: WorkspaceId,
  of: Endpoint,
  text: string,
  perType: number,
): Promise<LinkCandidate[]> {
  const found = await Promise.all(
    registry.order.map(async (type) => {
      const rows = await registry.of(type).rows(q, workspaceId, { text, limit: perType })
      return rows
        .filter((r) => !(type === of.type && r.id === of.id))
        .map((r) => ({ type, id: r.id, title: r.title, detail: r.detail }))
    }),
  )
  return found.flat()
}

/** Whether a thing exists and this workspace may see it -- both ends of a write go through here. */
export async function exists(
  registry: LinkRegistry,
  q: Queryable,
  workspaceId: WorkspaceId,
  end: Endpoint,
): Promise<boolean> {
  const rows = await registry.of(end.type).rows(q, workspaceId, { ids: [end.id] })
  return rows.length > 0
}
