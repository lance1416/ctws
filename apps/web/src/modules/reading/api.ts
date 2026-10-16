import {
  api,
  type CreateReadingItemBody,
  type ReadingItemResponse,
  type UpdateReadingItemBody,
  type ReadingId,
} from '@ctws/contracts'
import { queryOptions } from '@tanstack/react-query'
import { call, everyPage } from '../../platform/http/api'

// Every key starts with `'reading'`, so `[['reading']]` awaits all of them.

/** The whole list, or only what belongs to no project. */
export const readingQuery = ({ unfiled = false }: { unfiled?: boolean } = {}) =>
  queryOptions({
    queryKey: ['reading', 'list', unfiled ? 'unfiled' : 'all'],
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
    queryKey: ['reading', 'search', q],
    queryFn: async ({ signal }) =>
      (await call(api.reading.search, { query: { q } }, { signal })).reading,
  })

/** Calendar entries; the day is the server's, in the account's zone. */
export const readingCalendarQuery = (range: { from: string; to: string }) =>
  queryOptions({
    queryKey: ['reading', 'calendar', range.from, range.to],
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
