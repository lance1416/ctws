/** Little words a name's initials skip (FR-052), unless the name is nothing but them. */
const SMALL = new Set(['a', 'an', 'the', 'and', 'of', 'for', 'to', 'in', 'on'])

const HAN = /^\p{Script=Han}/u

/**
 * A project's initials, from its name (FR-052): one or two characters for the coloured square.
 * Two words or more give the first letters of the first two ("Job hunt" JH, "Find a lawyer" FL,
 * "rust-analyzer" RA); one word gives its first two letters ("CTWS" CT, "Thesis" TH); a name that
 * starts with a Han character gives that character ("搬家" 搬). Latin letters are raised. The person
 * can change them afterwards, and they never change on their own.
 */
export function initialsOf(name: string): string {
  const trimmed = name.trim()
  if (HAN.test(trimmed)) return [...trimmed][0]!
  const all = trimmed.split(/[\s-]+/).filter((w) => w.length > 0)
  const big = all.filter((w) => !SMALL.has(w.toLocaleLowerCase()))
  const words = big.length > 0 ? big : all
  if (words.length === 0) return ''
  const letters = (w: string, n: number) => [...w].slice(0, n).join('')
  const picked =
    words.length >= 2 ? letters(words[0]!, 1) + letters(words[1]!, 1) : letters(words[0]!, 2)
  return picked.toLocaleUpperCase()
}
