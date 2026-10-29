import { QueryClient } from '@tanstack/react-query'
import { refreshAfterWrites } from '../platform/http/refresh'
import { retryOnce } from '../platform/http/retry'
import { registry } from './registry'

/** The one query cache: the providers hand it to the pages, the router's loaders fill it early. */
export const queryClient: QueryClient = new QueryClient({
  // At most one retry: the default three hide a down server behind a spinner for seconds.
  // Five seconds taken as fresh: a page's loader starts its queries before the page is drawn
  // (baseline.md §8), and a part mounting after one has answered would otherwise ask again at once.
  // The app's own writes refresh what they change whatever the age (`refreshAfterWrites`).
  defaultOptions: { queries: { retry: retryOnce } },
  mutationCache: refreshAfterWrites(() => queryClient, registry.staleFor),
})
