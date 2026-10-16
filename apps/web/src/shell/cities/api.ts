import { api } from '@ctws/contracts'
import { queryOptions } from '@tanstack/react-query'
import { call } from '../../platform/http/api'

const cityKeys = {
  search: (q: string) => ['cities', q] as const,
}

/** Cities do not change names: asked once, kept, so backspacing while typing asks nothing. */
export const citiesQuery = (q: string) =>
  queryOptions({
    queryKey: cityKeys.search(q),
    queryFn: async ({ signal }) =>
      (await call(api.cities.search, { query: { q } }, { signal })).cities,
    staleTime: Infinity,
  })
