import { api } from '@ctws/contracts'
import { queryOptions, useQuery } from '@tanstack/react-query'
import { call } from '../../platform/http/api'
import { useRegistry } from '../registry'

type Range = { from: string; to: string }

/** Every module's counts of a week; any write anywhere may change one. */
export const weekCountKeys = {
  all: ['review', 'counts'] as const,
  of: (range: Range) => ['review', 'counts', range.from, range.to] as const,
}

const weekCountsQuery = (range: Range) =>
  queryOptions({
    queryKey: weekCountKeys.of(range),
    queryFn: async ({ signal }) =>
      (await call(api.review.counts, { query: range }, { signal })).counts,
  })

/**
 * The review's "Also this week" (FR-081): what each module counted of the week, in the modules'
 * order and words. A count the server did not give is left out.
 */
export function useAlsoThisWeek(range: Range | null) {
  const { weekCounts } = useRegistry()
  const counted = useQuery({ ...weekCountsQuery(range ?? { from: '', to: '' }), enabled: !!range })
  return {
    rows: counted.data
      ? weekCounts.flatMap((c) =>
          counted.data[c.key] === undefined ? [] : [{ ...c, count: counted.data[c.key]! }],
        )
      : null,
    isError: counted.isError,
    retry: () => void counted.refetch(),
  }
}
