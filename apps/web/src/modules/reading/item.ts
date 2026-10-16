import { readingIsFinished, type ReadingItemResponse } from '@ctws/contracts'
import { linkLabel } from '../../platform/ui/url'
import type { Recent } from '../../shell/search'

/**
 * The title typed, else the one fetched from the page, else the link's host and path. The fetched
 * title has its own column so a refetch never overwrites a typed one.
 */
export function readingLabel(
  item: Pick<ReadingItemResponse, 'title' | 'url'> & { fetchedTitle?: string | null },
): string {
  if (item.title) return item.title
  if (item.fetchedTitle) return item.fetchedTitle
  if (!item.url) return '(untitled)'
  return linkLabel(item.url)
}

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

export const isToRead = (item: Pick<ReadingItemResponse, 'status'>) =>
  !readingIsFinished(item.status)
