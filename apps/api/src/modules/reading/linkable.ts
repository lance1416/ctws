import { and, desc } from 'drizzle-orm'
import { wanted, type Linkable } from '../../shell/links/linkable'
import { visibleItems } from './store'
import { readingItems } from './tables'

export const readingLinkable: Linkable = {
  type: 'reading',
  label: 'Reading',
  rows: async (q, workspaceId, want) => {
    const { where, limit } = wanted(want, readingItems.id, [
      'reading_items.title',
      'reading_items.url',
      'reading_items.author',
    ])
    const found = await q
      .select({
        id: readingItems.id,
        title: readingItems.title,
        url: readingItems.url,
        author: readingItems.author,
      })
      .from(readingItems)
      .where(and(visibleItems(workspaceId), where))
      // Newest first, like the pile: what you just saved is what you are reaching for.
      .orderBy(desc(readingItems.createdAt), desc(readingItems.id))
      .limit(limit)
    // An untitled link shows its url, as everywhere else.
    return found.map((r) => ({ id: r.id, title: r.title ?? r.url ?? '', detail: r.author }))
  },
}
