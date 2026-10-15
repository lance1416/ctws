import type {
  CreateReadingItemBody,
  ReadingItemResponse,
  UpdateReadingItemBody,
} from '@ctws/contracts'
import { queryOptions } from '@tanstack/react-query'
import { apiFetch, calendarOf } from '../../platform/http/api'

const BASE = '/reading'

const items = async (path: string) => (await apiFetch<{ items: ReadingItemResponse[] }>(path)).items

// Every key starts with `'reading'`, so `[['reading']]` awaits all of them.

/** The whole list, or only what belongs to no project. */
export const readingQuery = ({ unfiled = false }: { unfiled?: boolean } = {}) =>
  queryOptions({
    queryKey: ['reading', 'list', unfiled ? 'unfiled' : 'all'],
    queryFn: () => items(unfiled ? `${BASE}?unfiled=true` : BASE),
  })

export const readingSearchQuery = (q: string) =>
  queryOptions({
    queryKey: ['reading', 'search', q],
    queryFn: () => items(`${BASE}/search?q=${encodeURIComponent(q)}`),
  })

/** Calendar entries; the day is the server's, in the account's zone. */
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
