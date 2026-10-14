import type { City } from '@ctws/contracts'
import { apiFetch } from '../../platform/http/api'

/** 找城市。表在服务端，打三个字母才问一次。 */
export async function findCities(q: string): Promise<City[]> {
  const res = await apiFetch<{ cities: City[] }>(`/cities?q=${encodeURIComponent(q)}`)
  return res.cities
}
