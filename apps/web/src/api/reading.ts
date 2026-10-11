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

/**
 * The cache entry one list of reading items lives in. Named here rather than written out at each
 * `useQuery`: a positional key spelled by hand is a second cache entry the moment one caller
 * writes it differently, and the list that never refreshes is the symptom.
 */
export const readingKey = (query: ReadingQuery = {}) =>
  [
    'reading',
    query.projectId ?? (query.unfiled ? 'unfiled' : null),
    query.statuses ?? null,
  ] as const

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
/**
 * 这一行写什么：人自己写的标题 > 抓回来的 > host 加路径。
 *
 * 顺序是定死的。人改过的标题不能被一次重抓盖掉 —— 这也是抓回来的那一个单独存一列、而不是写进
 * `title` 的原因。
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
 * 一条没有标题的链接写成 `github.com/lance1416/ctws`。
 *
 * host 一个人认得，但认不出是哪一个 repo、哪一条推 —— 一行写着 `x.com` 等于没有信息。查询串不
 * 要：utm 之类是噪音，而这一行本来就要在行宽里截断。
 */
export function linkLabel(url: string): string {
  try {
    const u = new URL(url)
    return u.host.replace(/^www\./, '') + u.pathname.replace(/\/$/, '')
  } catch {
    return url
  }
}
