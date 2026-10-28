import { readingIsFinished, type ReadingItemResponse, type ReadingStatus } from '@ctws/contracts'
import { linkLabel } from '../../../platform/ui/url'
import type { Recent } from '../../../shell/search'

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

/**
 * Its name in a row that says its site beside it: an untitled link by its path alone
 * ("blog/idempotency"), so the site is said once (R-02); a bare site by its host.
 */
export function nameBesideSite(
  item: Pick<ReadingItemResponse, 'title' | 'url'> & { fetchedTitle?: string | null },
): string {
  if (item.title || item.fetchedTitle || !item.url) return readingLabel(item)
  try {
    const path = decodeURIComponent(new URL(item.url).pathname).replace(/^\/+|\/+$/g, '')
    return path || readingLabel(item)
  } catch {
    return readingLabel(item)
  }
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

/** A reading item's status, in words. */
export const READING_STATUS_LABEL: Record<ReadingStatus, string> = {
  todo: 'To read',
  reading: 'Reading',
  done: 'Finished',
  dropped: 'Dropped',
}
