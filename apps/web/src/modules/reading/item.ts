import type { ReadingItemResponse } from '@ctws/contracts'
import { linkLabel } from '../../platform/ui/url'
import type { Recent } from '../../shell/search/recent'

/**
 * What an item is CALLED: the title a person wrote, else the one fetched from the page, else the
 * link's host and path. In that order, so a refetch never overwrites a title someone typed --
 * which is why the fetched one has a column of its own.
 */
export function readingLabel(
  item: Pick<ReadingItemResponse, 'title' | 'url'> & { fetchedTitle?: string | null },
): string {
  if (item.title) return item.title
  if (item.fetchedTitle) return item.fetchedTitle
  if (!item.url) return '(untitled)'
  return linkLabel(item.url)
}

/** How an item is listed in Recent: by the name every list gives it. */
export function recentEntry(
  item: Pick<ReadingItemResponse, 'id' | 'title' | 'url'> & { fetchedTitle?: string | null },
): Recent {
  return {
    type: 'reading',
    id: item.id,
    title: readingLabel(item),
    to: `/reading/${item.id}`,
    kind: 'Reading',
  }
}

/** Still to read: neither finished nor dropped. */
export const isToRead = (item: Pick<ReadingItemResponse, 'status'>) =>
  item.status === 'todo' || item.status === 'reading'
