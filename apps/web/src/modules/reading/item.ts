import type { ReadingItemResponse } from '@ctws/contracts'
import { linkLabel } from '../../platform/ui/url'

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

/** Still to read: neither finished nor dropped. */
export const isToRead = (item: Pick<ReadingItemResponse, 'status'>) =>
  item.status === 'todo' || item.status === 'reading'
