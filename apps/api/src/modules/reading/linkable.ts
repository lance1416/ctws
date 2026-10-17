import { desc, sql } from 'drizzle-orm'
import { scoped, within } from '../../platform/db/scope'
import { wanted, type Linkable } from '../../shell/links'
import { readingItems } from './tables'

export const readingLinkable: Linkable = {
  type: 'reading',
  rows: async (q, workspaceId, want) => {
    const { where, orderBy, limit } = wanted(
      want,
      {
        id: readingItems.id,
        title: sql`coalesce(${readingItems.title}, ${readingItems.fetchedTitle}, ${readingItems.url})`,
        text: [
          'reading_items.title',
          'reading_items.fetched_title',
          'reading_items.url',
          'reading_items.author',
        ],
      },
      // Newest first, like the pile: what you just saved is what you are reaching for.
      [desc(readingItems.createdAt), desc(readingItems.id)],
    )
    const found = await q
      .select({
        id: readingItems.id,
        title: readingItems.title,
        fetchedTitle: readingItems.fetchedTitle,
        url: readingItems.url,
        author: readingItems.author,
      })
      .from(readingItems)
      .where(within(scoped(readingItems, workspaceId), where))
      .orderBy(...orderBy)
      .limit(limit)
    // An untitled link shows the title fetched from its page, else its url, as everywhere else;
    // the table's shape check gives a link a url and a book a title.
    return found.map((r) => ({
      type: 'reading',
      id: r.id,
      title: r.title ?? r.fetchedTitle ?? r.url!,
      author: r.author,
    }))
  },
}
