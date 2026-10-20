import type { ObjectType, TimelineEntry } from '@ctws/contracts'
import { and, desc, eq } from 'drizzle-orm'
import { scoped, within } from '../../platform/db/scope'
import { afterCursor, type TimelineSource } from '../events'
import type { LinkRegistry } from '../links'
import { relations } from './tables'

/**
 * Where a thing was mentioned, on its timeline (FR-042, FR-045): the sentence, and what it was
 * written in, named by that thing's own module through the registry. What this workspace cannot
 * see is left out.
 */
export const mentionSource = (registry: LinkRegistry): TimelineSource => ({
  kind: 'mention',
  read: async (q, workspaceId, subject, span) => {
    const rows = await q
      .select()
      .from(relations)
      .where(
        within(
          scoped(relations, workspaceId),
          and(
            eq(relations.toType, subject.type),
            eq(relations.toId, subject.id),
            eq(relations.origin, 'mention'),
            afterCursor(span, 'mention', { at: relations.createdAt, id: relations.id }),
          ),
        ),
      )
      .orderBy(desc(relations.createdAt), desc(relations.id))
      .limit(span.limit)
    const titles = new Map<string, string>()
    for (const type of new Set(rows.map((r) => r.fromType))) {
      const ids = rows.filter((r) => r.fromType === type).map((r) => r.fromId)
      for (const thing of await registry
        .of(type as ObjectType)
        .rows(q, workspaceId, { ids, limit: ids.length })) {
        titles.set(`${type}:${thing.id}`, thing.title)
      }
    }
    return rows.flatMap((r): TimelineEntry[] => {
      const title = titles.get(`${r.fromType}:${r.fromId}`)
      if (title === undefined || r.excerpt === null) return []
      return [
        {
          kind: 'mention',
          relationId: r.id,
          at: r.createdAt.toISOString(),
          from: { type: r.fromType, id: r.fromId, title },
          excerpt: r.excerpt,
        },
      ]
    })
  },
})
