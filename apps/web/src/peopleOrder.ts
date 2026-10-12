import type { PersonResponse } from '@ctws/contracts'

/**
 * A PERSON LIST IN THE READER'S ORDER.
 *
 * The server returns them ordered by name so a page is deterministic, but a plain byte order puts
 * Chinese names in code-point order rather than pinyin order, and all of them after every Latin
 * name -- which is not where a reader looks for them. Ordering them is a COLLATION question.
 *
 * Done in the browser rather than in Postgres. The database has the ICU collations
 * (`zh-Hans-x-icu`) and using them would be tidier, but it would make correct ordering depend on
 * how the database image was built -- a deployment coupling for a list that is a few dozen rows
 * long. Every browser carries ICU, the comparison is free at this size, and nothing breaks if the
 * database is rebuilt without it.
 */
const collator = new Intl.Collator('zh-Hans', { sensitivity: 'base', numeric: true })

export function sortByName(people: readonly PersonResponse[]): PersonResponse[] {
  // A copy: the array belongs to the query cache, and sorting it in place would mutate what
  // every other reader of that cache entry sees.
  return [...people].sort((a, b) => collator.compare(a.name, b.name) || a.id.localeCompare(b.id))
}
