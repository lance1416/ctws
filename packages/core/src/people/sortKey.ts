import { pinyin } from 'pinyin-pro'
import { CJK, type NameParts } from './names'

// Its own module, and a subpath of the package (`@ctws/core/sort-key`): the pinyin dictionary it
// needs is the size of the rest of the app, so a page loads it only when it files someone.

/**
 * The letter a person is filed under, A to Z, from the family name (the given name when there is
 * none): a Latin initial without its accent, a Chinese one by the pinyin of the surname (陈 under
 * C, beside Chen), `#` for anything else.
 */
export function sortKey(parts: NameParts): string {
  const word = parts.familyName?.trim() || parts.givenName.trim()
  const first = [...word][0] ?? ''
  if (first === '') return '#'
  if (CJK.test(first)) {
    const letter = pinyin(first, { pattern: 'first', toneType: 'none', mode: 'surname' })
    return /^[a-z]$/i.test(letter) ? letter.toUpperCase() : '#'
  }
  const plain = first
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
  return /^[A-Z]$/.test(plain) ? plain : '#'
}
