import {
  api,
  type CreateReadingItemBody,
  type ReadingItemResponse,
  type UpdateReadingItemBody,
  type ReadingId,
} from '@ctws/contracts'
import { queryOptions } from '@tanstack/react-query'
import { call, everyPage } from '../../platform/http/api'

/** This module's query keys. Every one starts with `'reading'`, so `all` reaches each of them. */
export const readingKeys = {
  all: ['reading'] as const,
  list: (unfiled: boolean) => ['reading', 'list', unfiled ? 'unfiled' : 'all'] as const,
  search: (q: string) => ['reading', 'search', q] as const,
  calendar: (range: { from: string; to: string }) =>
    ['reading', 'calendar', range.from, range.to] as const,
}

/** The whole list, or only what belongs to no project. */
export const readingQuery = ({ unfiled = false }: { unfiled?: boolean } = {}) =>
  queryOptions({
    queryKey: readingKeys.list(unfiled),
    queryFn: async ({ signal }) =>
      (
        await everyPage(
          (cursor) =>
            call(
              api.reading.list,
              { query: { ...(unfiled ? { unfiled: 'true' } : {}), cursor } },
              { signal },
            ),
          signal,
        )
      ).flatMap((p) => p.reading),
  })

export const readingSearchQuery = (q: string) =>
  queryOptions({
    queryKey: readingKeys.search(q),
    queryFn: async ({ signal }) =>
      (await call(api.reading.search, { query: { q } }, { signal })).reading,
  })

/** Calendar entries; the day is the server's, in the account's zone. */
export const readingCalendarQuery = (range: { from: string; to: string }) =>
  queryOptions({
    queryKey: readingKeys.calendar(range),
    queryFn: async ({ signal }) =>
      (await call(api.reading.calendar, { query: { view: 'calendar', ...range } }, { signal }))
        .entries,
  })

export function createReadingItem(body: CreateReadingItemBody): Promise<ReadingItemResponse> {
  return call(api.reading.create, { body })
}

export function patchReadingItem(
  id: ReadingId,
  body: UpdateReadingItemBody,
): Promise<ReadingItemResponse> {
  return call(api.reading.update, { params: { id }, body })
}

export function deleteReadingItem(id: ReadingId): Promise<void> {
  return call(api.reading.remove, { params: { id } })
}
