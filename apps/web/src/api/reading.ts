import type {
  CreateReadingItemBody,
  ReadingItemResponse,
  ReadingStatus,
  UpdateReadingItemBody,
} from '@ctws/contracts'
import { apiFetch, calendarOf } from '../api'

/** The reading module's own namespace. Nothing in the task module reaches in here. */
const BASE = '/reading'

export type ReadingQuery = {
  projectId?: string
  /** Only what belongs to no project -- the workbench card's whole contents. */
  unfiled?: boolean
  statuses?: readonly ReadingStatus[]
}

export async function listReading(query: ReadingQuery = {}): Promise<ReadingItemResponse[]> {
  const params = new URLSearchParams()
  if (query.projectId) params.set('projectId', query.projectId)
  if (query.unfiled) params.set('unfiled', 'true')
  for (const s of query.statuses ?? []) params.append('status', s)
  const suffix = params.size > 0 ? `?${params}` : ''
  return (await apiFetch<{ items: ReadingItemResponse[] }>(`${BASE}${suffix}`)).items
}

export async function searchReading(query: string): Promise<ReadingItemResponse[]> {
  const path = `${BASE}/search?q=${encodeURIComponent(query)}`
  return (await apiFetch<{ items: ReadingItemResponse[] }>(path)).items
}

/** This module's dated things for a window. The DAY is the server's, in the account's zone. */
export const readingCalendar = (range: { from: string; to: string }) => calendarOf(BASE, range)

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

/**
 * What a row is CALLED when nobody has typed a title: its host.
 *
 * THE HOST, for a pasted link: the url itself is unreadable at row width and the host is the
 * part a person recognises. A url the browser cannot parse falls back to the raw string rather than to
 * an empty row, because an item you cannot see is worse than an ugly one.
 */
export function readingLabel(item: Pick<ReadingItemResponse, 'title' | 'url'>): string {
  if (item.title) return item.title
  if (!item.url) return '(untitled)'
  try {
    return new URL(item.url).host.replace(/^www\./, '')
  } catch {
    return item.url
  }
}
