import { api } from '@ctws/contracts'
import { queryOptions } from '@tanstack/react-query'
import { call } from '../../platform/http/api'

/** Cities do not change names: asked once, kept, so backspacing while typing asks nothing. */
export const citiesQuery = (q: string) =>
  queryOptions({
    queryKey: ['cities', q],
    queryFn: async () => (await call(api.cities.search, { query: { q } })).cities,
    staleTime: Infinity,
  })
