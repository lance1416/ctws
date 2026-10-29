import { api, type ObjectType } from '@ctws/contracts'
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import { call } from '../../platform/http/api'

/** One kind's page while it is looked through alone. */
const PAGE = 30

const searchKeys = {
  everything: (q: string, recent: readonly string[]) =>
    ['search', 'everything', q, recent.join(',')] as const,
  kind: (q: string, kind: ObjectType, recent: readonly string[]) =>
    ['search', 'kind', kind, q, recent.join(',')] as const,
}

/** What was opened lately, as the search asks with it: first among equally good matches. */
const recentQuery = (recent: readonly string[]) =>
  recent.length > 0 ? { recent: recent.join(',') } : {}

/** Every kind's first five for these words, and how many each has (FR-024, `GET /search`). */
export const everythingQuery = (q: string, recent: readonly string[] = []) =>
  queryOptions({
    queryKey: searchKeys.everything(q, recent),
    queryFn: ({ signal }) =>
      call(
        api.search.everything,
        { query: { q, limit: PAGE, ...recentQuery(recent) } },
        { signal },
      ),
  })

/** One kind's matches, a page at a time as the list is scrolled to its end. */
export const kindQuery = (q: string, kind: ObjectType, recent: readonly string[] = []) =>
  infiniteQueryOptions({
    queryKey: searchKeys.kind(q, kind, recent),
    queryFn: ({ pageParam, signal }) =>
      call(
        api.search.everything,
        {
          query: {
            q,
            kind,
            limit: PAGE,
            ...recentQuery(recent),
            ...(pageParam ? { cursor: pageParam } : {}),
          },
        },
        { signal },
      ),
    // A kind's pages start with no cursor; none at the end means no more.
    initialPageParam: '',
    getNextPageParam: (last) => last.page?.nextCursor ?? undefined,
  })
