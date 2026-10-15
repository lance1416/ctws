import type { City } from '@ctws/contracts'
import { queryOptions } from '@tanstack/react-query'
import { apiFetch } from '../../platform/http/api'

async function findCities(q: string): Promise<City[]> {
  const res = await apiFetch<{ cities: City[] }>(`/cities?q=${encodeURIComponent(q)}`)
  return res.cities
}

/** Cities do not change names: asked once, kept, so backspacing while typing asks nothing. */
export const citiesQuery = (q: string) =>
  queryOptions({ queryKey: ['cities', q], queryFn: () => findCities(q), staleTime: Infinity })
