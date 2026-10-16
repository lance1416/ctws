import { desc } from 'drizzle-orm'
import { scoped, within } from '../../platform/db/scope'
import { wanted, type Linkable } from '../../shell/links'
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
      .where(within(scoped(readingItems, workspaceId), where))
      // Newest first, like the pile: what you just saved is what you are reaching for.
      .orderBy(desc(readingItems.createdAt), desc(readingItems.id))
      .limit(limit)
    // An untitled link shows its url, as everywhere else; the table's shape check gives a link
    // a url and a book a title.
    return found.map((r) => ({ id: r.id, title: r.title ?? r.url!, detail: r.author }))
  },
}
