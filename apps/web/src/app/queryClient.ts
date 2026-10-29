import { QueryClient } from '@tanstack/react-query'
import { refreshAfterWrites } from '../platform/http/refresh'
import { retryOnce } from '../platform/http/retry'
import { registry } from './registry'

/**
 * The reads the page on screen had its loader start, by query, with how many answers the query had
 * then: its next answer is the one the page's parts, mounting now, would ask for. A navigation
 * fills `asking` as its loader runs and hands it over when it lands (`landed`); one with no loader
 * hands over nothing, so nothing from an earlier page is taken as new.
 */
let asking = new Map<string, number>()
let askedByLoader = new Map<string, number>()

/** Runs a loader's prefetches, noting each read they start; gives back what they give. */
export function asLoader<T>(prefetch: () => T): T {
  const stop = queryClient.getQueryCache().subscribe((event) => {
    if (event.type === 'updated' && event.action.type === 'fetch')
      asking.set(event.query.queryHash, event.query.state.dataUpdateCount)
  })
  try {
    return prefetch()
  } finally {
    stop()
  }
}

/** A navigation has landed: its loader's reads are the page's now, and only those. */
export function landed(): void {
  askedByLoader = asking
  asking = new Map()
}

/** The one query cache: the providers hand it to the pages, the router's loaders fill it early. */
export const queryClient: QueryClient = new QueryClient({
  // At most one retry: the default three hide a down server behind a spinner for seconds.
  // A page's loader asks for its data before the page is drawn (baseline.md §8); the parts that
  // mount a moment later take that answer rather than ask again (it is this navigation's, so it
  // is new). Anything else read before is asked for again on mounting, as ever; so is an answer
  // a write has marked stale since.
  defaultOptions: {
    queries: {
      retry: retryOnce,
      refetchOnMount: (query) => {
        const before = askedByLoader.get(query.queryHash)
        return (
          before === undefined ||
          query.state.isInvalidated ||
          query.state.dataUpdateCount !== before + 1
        )
      },
    },
  },
  mutationCache: refreshAfterWrites(() => queryClient, registry.staleFor),
})
