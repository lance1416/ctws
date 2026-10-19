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
