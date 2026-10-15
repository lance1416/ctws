import type { PersonResponse } from '@ctws/contracts'

/**
 * Chinese names in pinyin order among the Latin ones, which the server's byte order does not give.
 * Collated in the browser so the order does not depend on how the database's ICU was built.
 */
const collator = new Intl.Collator('zh-Hans', { sensitivity: 'base', numeric: true })

export function sortByName(people: readonly PersonResponse[]): PersonResponse[] {
  // A copy: sorting in place would mutate the query cache's array.
  return [...people].sort((a, b) => collator.compare(a.name, b.name) || a.id.localeCompare(b.id))
}
