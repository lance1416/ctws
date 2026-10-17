import {
  type LinkCandidate,
  type LinkedObject,
  type LinkId,
  type LinkKind,
  type LinksResponse,
  type ObjectType,
  type WorkspaceId,
} from '@ctws/contracts'
import { and, eq, inArray, or } from 'drizzle-orm'
import type { Queryable } from '../../platform/db/client'
import { scoped, within } from '../../platform/db/scope'
import { links } from './tables'
import type { Endpoint } from './store'
import type { LinkRegistry } from './registry'

/** How many of one kind of object a page shows. */
const PER_GROUP = 200

/** The edge-table rows at `of`, by the far end each points at, of the kinds asked for. */
async function storedEdges(
  q: Queryable,
  workspaceId: WorkspaceId,
  of: Endpoint,
  types: readonly ObjectType[],
): Promise<{ id: LinkId; type: ObjectType; farId: string; kind: LinkKind; outgoing: boolean }[]> {
  const rows = await q
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
          and(
            eq(links.fromType, of.type),
            eq(links.fromId, of.id),
            inArray(links.toType, [...types]),
          ),
          and(
            eq(links.toType, of.type),
            eq(links.toId, of.id),
            inArray(links.fromType, [...types]),
          ),
        ),
      ),
    )
  return rows.map((e) =>
    e.fromType === of.type && e.fromId === of.id
      ? { id: e.id, type: e.toType, farId: e.toId, kind: e.kind, outgoing: true }
      : { id: e.id, type: e.fromType, farId: e.fromId, kind: e.kind, outgoing: false },
  )
}

/**
 * Everything one object is connected to, read in both directions since an edge is one fact, among
 * the kinds of thing asked for.
 */
export async function linksOf(
  registry: LinkRegistry,
  q: Queryable,
  workspaceId: WorkspaceId,
  of: Endpoint,
  types: readonly ObjectType[] = registry.order,
): Promise<LinksResponse> {
  const stored = await storedEdges(q, workspaceId, of, types)

  // The far ends, named by their modules a kind at a time, and the edges modules keep themselves,
  // named already; only edge-table rows can be unlinked, since a task's project is a NOT NULL column.
  const byType = new Map<ObjectType, LinkedObject[]>()
  const add = (type: ObjectType, items: LinkedObject[]) => {
    if (items.length > 0) byType.set(type, [...(byType.get(type) ?? []), ...items])
  }
  await Promise.all([
    ...types.map(async (type) => {
      const edges = stored.filter((e) => e.type === type)
      if (edges.length === 0) return
      const ids = [...new Set(edges.map((e) => e.farId))]
      const rows = await registry.of(type).rows(q, workspaceId, { ids, limit: PER_GROUP })
      const named = new Map(rows.map((r) => [r.id, r]))
      // A far end that did not come back is deleted, foreign or past the group's end: dropped.
      add(
        type,
        edges.flatMap((e) => {
          const thing = named.get(e.farId)
          return thing ? [{ ...thing, kind: e.kind, outgoing: e.outgoing, linkId: e.id }] : []
        }),
      )
    }),
    ...registry.all.flatMap((l) =>
      types.flatMap((type) => {
        const read = l.own?.[type]
        if (!read) return []
        return [
          read(q, workspaceId, of, PER_GROUP).then((rows) =>
            add(
              type,
              rows.map((r) => ({ ...r, linkId: null })),
            ),
          ),
        ]
      }),
    ),
  ])

  return {
    groups: registry.order
      .filter((type) => byType.has(type))
      .map((type) => {
        // One row per object, kind and direction; a module's own edges may repeat one.
        const seen = new Set<string>()
        const items = byType.get(type)!.filter((o) => {
          const key = `${o.id}:${o.kind}:${o.outgoing}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        return {
          type,
          items: items
            // By title, by code point rather than locale, so names sort as the database sorts them.
            .sort((a, b) => (a.title < b.title ? -1 : a.title > b.title ? 1 : a.id < b.id ? -1 : 1))
            .slice(0, PER_GROUP),
        }
      }),
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
      return rows.filter((r) => !(type === of.type && r.id === of.id))
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
  const rows = await registry.of(end.type).rows(q, workspaceId, { ids: [end.id], limit: 1 })
  return rows.length > 0
}
