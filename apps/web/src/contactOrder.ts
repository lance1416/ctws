import type { ContactResponse } from '@ctws/contracts'

/**
 * A CONTACT LIST IN THE READER'S ORDER.
 *
 * The server returns them ordered by name so a page is deterministic, but a plain byte order puts
 * 陈颖 before 老王 and both after every Latin name -- which is not where a reader looks for them.
 * Chinese names belong in pinyin order, and that is a COLLATION question, not a sorting one.
 *
 * Done in the browser rather than in Postgres. The database has the ICU collations
 * (`zh-Hans-x-icu`) and using them would be tidier, but it would make correct ordering depend on
 * how the database image was built -- a deployment coupling for a list that is a few dozen rows
 * long. Every browser carries ICU, the comparison is free at this size, and nothing breaks if the
 * database is rebuilt without it.
 */
const collator = new Intl.Collator('zh-Hans', { sensitivity: 'base', numeric: true })

export function sortByName(contacts: readonly ContactResponse[]): ContactResponse[] {
  // A copy: the array belongs to the query cache, and sorting it in place would mutate what
  // every other reader of that cache entry sees.
  return [...contacts].sort((a, b) => collator.compare(a.name, b.name) || a.id.localeCompare(b.id))
}
