/** A party's initials from its name: a Chinese name's first character, else first and last words'. */
export const initialsOf = (name: string) => {
  const words = name.trim().split(/\s+/)
  const first = [...(words[0] ?? '')][0] ?? ''
  if (/\p{Script=Han}/u.test(first)) return first
  const last = words.length > 1 ? ([...words.at(-1)!][0] ?? '') : ''
  return (first + last).toUpperCase()
}
