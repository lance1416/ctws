import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { textMatches } from '../db/like'
import { readingItems } from '../db/schema'
import type { Linkable } from '../links/linkable'

/** 待读 names its own items for the shell. See `links/linkable.ts` for why this exists. */
export const readingLinkable: Linkable = {
  type: 'reading',
  label: 'Reading',
  name: async (q, workspaceId, ids) => {
    const rows = await q
      .select({
        id: readingItems.id,
        title: readingItems.title,
        url: readingItems.url,
        author: readingItems.author,
      })
      .from(readingItems)
      .where(
        and(
          eq(readingItems.workspaceId, workspaceId),
          isNull(readingItems.deletedAt),
          inArray(readingItems.id, [...ids]),
        ),
      )
    return new Map(
      rows.map((r) => [
        r.id,
        // An untitled link is shown by its url, the same fallback the list and the calendar use.
        { title: r.title ?? r.url ?? '', detail: r.author },
      ]),
    )
  },
  find: async (q, workspaceId, text, limit) => {
    const rows = await q
      .select({
        id: readingItems.id,
        title: readingItems.title,
        url: readingItems.url,
        author: readingItems.author,
      })
      .from(readingItems)
      .where(
        and(
          eq(readingItems.workspaceId, workspaceId),
          isNull(readingItems.deletedAt),
          text === ''
            ? undefined
            : textMatches(
                ['reading_items.title', 'reading_items.url', 'reading_items.author'],
                text,
              ),
        ),
      )
      // Newest first, like the pile itself: the thing you just saved is the thing you are most
      // likely to be reaching for.
      .orderBy(desc(readingItems.createdAt), desc(readingItems.id))
      .limit(limit)
    return rows.map((r) => ({ id: r.id, title: r.title ?? r.url ?? '', detail: r.author }))
  },
}
