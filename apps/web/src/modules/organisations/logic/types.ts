/** What the filters call the organisations with no type (FR-064). */
export const OTHER = 'Other'

/**
 * A type as its filter says it, for several: "Law firms", "Companies". Types are free text, so this
 * is English plurals' common rule, not a dictionary.
 */
export function pluralType(type: string): string {
  if (/[^aeiou]y$/i.test(type)) return `${type.slice(0, -1)}ies`
  if (/(s|x|z|ch|sh)$/i.test(type)) return `${type}es`
  return `${type}s`
}

/** The letter an organisation is filed under in the sidebar: A to Z, else #. */
export function fileLetter(name: string): string {
  const first = name.trim().charAt(0).toLocaleUpperCase('en')
  return /^[A-Z]$/.test(first) ? first : '#'
}
