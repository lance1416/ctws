import type { City } from '@ctws/contracts'
import rows from './cities.json'

/**
 * Cities from GeoNames `cities15000` (CC BY 4.0), extracted by `tools/cities/` and inlined at
 * build time. The rows sit in memory, ordered by population, and a query scans them linearly.
 */

type Row = [name: string, region: string, country: string, population: number, timeZone: string]
const CITIES = rows as Row[]

/** Typing ignores case and accents: `zurich` finds `Zürich`. */
const plain = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/** Each city's name as a query is compared with it, worked out once rather than per query. */
const NAMES = CITIES.map((row) => plain(row[0]))

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
  for (const [i, row] of CITIES.entries()) {
    const name = NAMES[i]!
    if (name.startsWith(q)) starts.push(cityOf(row))
    else if (name.includes(q)) contains.push(cityOf(row))
    if (starts.length >= MAX_HITS) break
  }
  return [...starts, ...contains].slice(0, MAX_HITS)
}

function cityOf(row: Row): City {
  return { label: labelOf(row), key: keyOf(row), timeZone: row[4] }
}

/** `name|region|country`: the row's own name, stable across rebuilds of the table. */
const keyOf = ([name, region, country]: Row): string => `${name}|${region}|${country}`

/**
 * The zone a city keeps time in, by its key, or by its shown label when only that is stored:
 * namesakes then resolve to the most populous one, which is the table's order (FR-049).
 */
/** A stored city resolved to the table: by its key, by its full label, or by its bare name. */
export type ResolvedCity = { key: string; label: string; timeZone: string; byNameOnly: boolean }

/**
 * What the migration makes of a city the last release stored as text: the row its key or its
 * full label names, else the most populous row with that bare name (`Cambridge`), flagged so
 * the report can say the match was by name alone (FR-099).
 */
export function resolveCity(key: string | null, label: string | null): ResolvedCity | null {
  const exact =
    (key !== null && CITIES.find((r) => keyOf(r) === key)) ||
    (label !== null && CITIES.find((r) => labelOf(r) === label.trim()))
  if (exact) return { ...cityOf(exact), byNameOnly: false }
  if (label === null) return null
  const name = plain(label.split(',')[0]!.trim())
  const i = NAMES.indexOf(name)
  return i < 0 ? null : { ...cityOf(CITIES[i]!), byNameOnly: true }
}

export function cityTimeZone(key: string | null, label: string | null): string | null {
  if (key !== null) {
    const row = CITIES.find((r) => keyOf(r) === key)
    if (row) return row[4]
  }
  if (label !== null) {
    const row = CITIES.find((r) => labelOf(r) === label)
    if (row) return row[4]
  }
  return null
}
