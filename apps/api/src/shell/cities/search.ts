import type { City } from '@ctws/contracts'
import rows from './cities.json'

/**
 * Cities from GeoNames `cities15000` (CC BY 4.0), extracted by `tools/cities/` and inlined at
 * build time. The rows sit in memory, ordered by population, and a query scans them linearly.
 */

type Row = [name: string, region: string, country: string, population: number]
const CITIES = rows as Row[]

/** Typing ignores case and accents: `zurich` finds `Zürich`. */
const plain = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/** `Oxford, England, United Kingdom`, with a repeated part said once (`Beijing, China`). */
function labelOf([name, region, country]: Row): string {
  const parts = [name, region, country].filter((p) => p !== '')
  return [...new Set(parts)].join(', ')
}

/** Fewer letters than this is still typing, not searching. */
const MIN_QUERY = 3
const MAX_HITS = 8

/** Names starting with the query first, then names containing it; each by population. */
export function findCities(query: string): City[] {
  const q = plain(query.trim())
  if (q.length < MIN_QUERY) return []

  const starts: City[] = []
  const contains: City[] = []
  for (const row of CITIES) {
    const name = plain(row[0])
    if (name.startsWith(q)) starts.push(cityOf(row))
    else if (name.includes(q)) contains.push(cityOf(row))
    if (starts.length >= MAX_HITS) break
  }
  return [...starts, ...contains].slice(0, MAX_HITS)
}

function cityOf(row: Row): City {
  return { label: labelOf(row) }
}
