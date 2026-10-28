import { api, type ObjectType } from '@ctws/contracts'
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import { call } from '../../platform/http/api'

/** One kind's page while it is looked through alone. */
const PAGE = 30

const searchKeys = {
  everything: (q: string) => ['search', 'everything', q] as const,
  kind: (q: string, kind: ObjectType) => ['search', 'kind', kind, q] as const,
}

/** Every kind's first five for these words, and how many each has (FR-024, `GET /search`). */
export const everythingQuery = (q: string) =>
  queryOptions({
    queryKey: searchKeys.everything(q),
    queryFn: ({ signal }) => call(api.search.everything, { query: { q, limit: PAGE } }, { signal }),
  })

/** One kind's matches, a page at a time as the list is scrolled to its end. */
export const kindQuery = (q: string, kind: ObjectType) =>
  infiniteQueryOptions({
    queryKey: searchKeys.kind(q, kind),
    queryFn: ({ pageParam, signal }) =>
      call(
        api.search.everything,
        { query: { q, kind, limit: PAGE, ...(pageParam ? { cursor: pageParam } : {}) } },
        { signal },
      ),
    // A kind's pages start with no cursor; none at the end means no more.
    initialPageParam: '',
    getNextPageParam: (last) => last.page?.nextCursor ?? undefined,
  })
