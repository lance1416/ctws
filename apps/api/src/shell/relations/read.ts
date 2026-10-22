import type { ObjectType, RelatedObject, RelationsResponse, WorkspaceId } from '@ctws/contracts'
import { and, eq, inArray, or } from 'drizzle-orm'
import type { Queryable } from '../../platform/db/client'
import { scoped, within } from '../../platform/db/scope'
import type { LinkRegistry } from '../links/registry'
import type { Endpoint } from './store'
import { relations } from './tables'

/** How many of one kind of thing a page shows. */
const PER_GROUP = 200

/**
 * Everything one thing is related to, read in both directions since a relation is one fact,
 * among the kinds of thing asked for, each named by its own module. A far end its module does
 * not return (deleted, foreign) is dropped.
 */
export async function relationsOf(
  registry: LinkRegistry,
  q: Queryable,
  workspaceId: WorkspaceId,
  of: Endpoint,
  types: readonly ObjectType[] = registry.order,
): Promise<RelationsResponse> {
  const rows = await q
    .select()
    .from(relations)
    .where(
      within(
        scoped(relations, workspaceId),
        or(
          and(
            eq(relations.fromType, of.type),
            eq(relations.fromId, of.id),
            inArray(relations.toType, [...types]),
          ),
          and(
            eq(relations.toType, of.type),
            eq(relations.toId, of.id),
            inArray(relations.fromType, [...types]),
          ),
        ),
      ),
    )
  const edges = rows.map((r) => {
    const outgoing = r.fromType === of.type && r.fromId === of.id
    return {
      relationId: r.id,
      type: outgoing ? r.toType : r.fromType,
      farId: outgoing ? r.toId : r.fromId,
      origin: r.origin,
      note: r.note,
      excerpt: r.excerpt,
      outgoing,
      createdAt: r.createdAt.toISOString(),
    }
  })

  const groups = await Promise.all(
    registry.order
      .filter((type) => types.includes(type))
      .map(async (type) => {
        const mine = edges.filter((e) => e.type === type)
        if (mine.length === 0) return null
        const ids = [...new Set(mine.map((e) => e.farId))]
        const named = new Map(
          (await registry.of(type).rows(q, workspaceId, { ids, limit: PER_GROUP })).map((r) => [
            r.id,
            r,
          ]),
        )
        const items: RelatedObject[] = mine.flatMap((e) => {
          const thing = named.get(e.farId)
          if (!thing) return []
          const { type: _type, farId: _farId, ...rest } = e
          return [{ ...thing, ...rest }]
        })
        // Newest relation first; a mention's sentence and a hand-made note read in that order.
        items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
        return { type, items: items.slice(0, PER_GROUP) }
      }),
  )
  return { groups: groups.filter((g) => g !== null) }
}

/**
 * For each of many things of one kind, the things of kind `to` related to it, named by their own
 * module: the organisations each task in a project is linked to, for the mark after its name
 * (FR-047, FR-054). Read in both directions, as a relation is one fact; things with none are
 * left out.
 */
export async function relatedAmong(
  registry: LinkRegistry,
  q: Queryable,
  workspaceId: WorkspaceId,
  from: { type: ObjectType; ids: readonly string[] },
  to: ObjectType,
): Promise<Map<string, { id: string; title: string }[]>> {
  const out = new Map<string, { id: string; title: string }[]>()
  if (from.ids.length === 0) return out
  const rows = await q
    .select()
    .from(relations)
    .where(
      within(
        scoped(relations, workspaceId),
        or(
          and(
            eq(relations.fromType, from.type),
            inArray(relations.fromId, [...from.ids]),
            eq(relations.toType, to),
          ),
          and(
            eq(relations.toType, from.type),
            inArray(relations.toId, [...from.ids]),
            eq(relations.fromType, to),
          ),
        ),
      ),
    )
  const pairs = rows.map((r) =>
    r.fromType === from.type && from.ids.includes(r.fromId)
      ? { own: r.fromId, far: r.toId }
      : { own: r.toId, far: r.fromId },
  )
  const far = [...new Set(pairs.map((p) => p.far))]
  if (far.length === 0) return out
  const named = new Map(
    (await registry.of(to).rows(q, workspaceId, { ids: far, limit: far.length })).map((r) => [
      r.id,
      r,
    ]),
  )
  for (const { own, far: id } of pairs) {
    const thing = named.get(id)
    if (!thing) continue
    const list = out.get(own) ?? []
    if (!list.some((t) => t.id === id)) list.push({ id, title: thing.title })
    out.set(own, list)
  }
  return out
}
