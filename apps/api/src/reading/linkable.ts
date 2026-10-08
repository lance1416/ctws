import { and, eq, inArray, isNull } from 'drizzle-orm'
import { readingItems } from '../db/schema'
import type { Linkable } from '../links/linkable'

/** 待读 names its own items for the shell. See `links/linkable.ts` for why this exists. */
export const readingLinkable: Linkable = {
  type: 'reading',
  label: '要读的',
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
}
