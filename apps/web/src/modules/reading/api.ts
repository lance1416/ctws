import type {
  CreateReadingItemBody,
  ReadingItemResponse,
  UpdateReadingItemBody,
} from '@ctws/contracts'
import { queryOptions } from '@tanstack/react-query'
import { apiFetch, calendarOf } from '../../platform/http/api'

/** The reading module's own namespace. Nothing in the task module reaches in here. */
const BASE = '/reading'

const items = async (path: string) => (await apiFetch<{ items: ReadingItemResponse[] }>(path)).items

/*
 * EVERY READING QUERY. Each key starts with `'reading'`, so `[['reading']]` awaits all of them.
 */

/** The whole list, or only what belongs to no project -- the Workbench card's whole contents. */
export const readingQuery = ({ unfiled = false }: { unfiled?: boolean } = {}) =>
  queryOptions({
    queryKey: ['reading', 'list', unfiled ? 'unfiled' : 'all'],
    queryFn: () => items(unfiled ? `${BASE}?unfiled=true` : BASE),
  })

/** Titles, authors and hosts. */
export const readingSearchQuery = (q: string) =>
  queryOptions({
    queryKey: ['reading', 'search', q],
    queryFn: () => items(`${BASE}/search?q=${encodeURIComponent(q)}`),
  })

/** This module's dated things for a window. The DAY is the server's, in the account's zone. */
export const readingCalendarQuery = (range: { from: string; to: string }) =>
  queryOptions({
    queryKey: ['reading', 'calendar', range.from, range.to],
    queryFn: () => calendarOf(BASE, range),
  })

export function createReadingItem(body: CreateReadingItemBody): Promise<ReadingItemResponse> {
  return apiFetch(BASE, { method: 'POST', body: JSON.stringify(body) })
}

export function patchReadingItem(
  id: string,
  body: UpdateReadingItemBody,
): Promise<ReadingItemResponse> {
  return apiFetch(`${BASE}/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
}

export function deleteReadingItem(id: string): Promise<void> {
  return apiFetch(`${BASE}/${id}`, { method: 'DELETE' })
}
