import type { PersonResponse } from '@ctws/contracts'

/**
 * Chinese names in pinyin order, which the server's byte order does not give, ahead of the Latin.
 * Collated in the browser so the order does not depend on how the database's ICU was built.
 */
const collator = new Intl.Collator('zh-Hans', { sensitivity: 'base', numeric: true })

/** Within the letter they are filed under, by the name that files them: family name, then given. */
export function sortByFiled(people: readonly PersonResponse[]): PersonResponse[] {
  const filed = (p: PersonResponse) => p.familyName?.trim() || p.givenName
  return [...people].sort(
    (a, b) =>
      collator.compare(filed(a), filed(b)) ||
      collator.compare(a.givenName, b.givenName) ||
      a.id.localeCompare(b.id),
  )
}
