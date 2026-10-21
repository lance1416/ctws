/**
 * A project's initials, from its name (FR-052): one or two characters for the coloured square.
 * "Job hunt" gives JH, "rust-analyzer" RA, "Thesis" T, "搬家" 搬. Shown as given; a Latin letter is
 * raised to a capital. The person can change them afterwards, and they never change on their own.
 */
export function initialsOf(name: string): string {
  const words = name
    .trim()
    .split(/[\s\-_/]+/)
    .filter((w) => w.length > 0)
  if (words.length === 0) return ''
  const first = (w: string): string => [...w][0]!.toUpperCase()
  return words.length >= 2 ? first(words[0]!) + first(words[1]!) : first(words[0]!)
}
