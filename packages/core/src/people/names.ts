import { pinyin } from 'pinyin-pro'

/**
 * A person's name in three parts, after vCard's `N` (RFC 6350): given, middle, family (FR-049).
 * The parts are what is stored; how they are shown follows the script, and how they are sorted
 * follows the family name's first letter, with Chinese surnames filed by their pinyin.
 */
export type NameParts = {
  givenName: string
  /** Several middle names are kept as one string, space-separated. */
  middleName: string | null
  familyName: string | null
}

/** Why a split needs a look (FR-099's "Names" section), or null when it was plain. */
export type SplitWhy =
  'Had a comma' | 'One word' | 'Had a space' | 'Several words' | 'Compound surname'

const CJK = /[㐀-䶿一-鿿豈-﫿]/
const ALL_CJK = /^[㐀-䶿一-鿿豈-﫿\s·•]+$/

/**
 * The common two-character Chinese surnames. A longer list exists; these are the ones anyone is
 * likely to meet, and a wrong split is shown in the migration report to be corrected by hand.
 */
const COMPOUND_SURNAMES = [
  '欧阳',
  '司马',
  '诸葛',
  '上官',
  '夏侯',
  '东方',
  '皇甫',
  '尉迟',
  '公孙',
  '慕容',
  '长孙',
  '宇文',
  '司徒',
  '轩辕',
  '令狐',
  '钟离',
  '闾丘',
  '南宫',
  '百里',
  '呼延',
  '端木',
  '公羊',
  '澹台',
  '东郭',
  '独孤',
  '西门',
  '司空',
  '太史',
  '申屠',
  '公冶',
  '淳于',
  '单于',
  '鲜于',
  '拓跋',
  '赫连',
  '完颜',
  '耶律',
  '纳兰',
  '万俟',
  '东门',
  '左丘',
  '第五',
  '梁丘',
  '微生',
  '羊舌',
  '乐正',
  '仲孙',
  '叔孙',
  '轩辕',
  '谷梁',
  '宗政',
  '濮阳',
  '闻人',
  '仉督',
  '子车',
  '颛孙',
  '壤驷',
  '夹谷',
  '宰父',
  '段干',
] as const

/**
 * Splits a name written as one string (FR-095). Chinese: the first character is the family name,
 * two for a compound surname, the rest the given name; a space inside is dropped. Latin script: a
 * comma puts the family name first ("Li, Wendy"); otherwise the last word is the family name, the
 * first the given name, anything between a middle name; one word is a given name alone.
 */
export function splitName(text: string): NameParts & { why: SplitWhy | null } {
  const raw = text.trim().replace(/\s+/g, ' ')
  if (raw.includes(',')) {
    const [family = '', rest = ''] = raw.split(',', 2).map((s) => s.trim())
    const [given = '', ...middle] = rest.split(' ').filter(Boolean)
    return {
      givenName: given || family,
      middleName: middle.length > 0 ? middle.join(' ') : null,
      familyName: given ? family : null,
      why: 'Had a comma',
    }
  }
  if (ALL_CJK.test(raw)) {
    const hadSpace = /\s/.test(raw)
    const chars = raw.replace(/[\s·•]/g, '')
    const compound = COMPOUND_SURNAMES.find((s) => chars.startsWith(s) && chars.length > s.length)
    if (compound) {
      return {
        givenName: chars.slice(compound.length),
        middleName: null,
        familyName: compound,
        why: 'Compound surname',
      }
    }
    if (chars.length === 1)
      return { givenName: chars, middleName: null, familyName: null, why: 'One word' }
    return {
      givenName: chars.slice(1),
      middleName: null,
      familyName: chars.slice(0, 1),
      why: hadSpace ? 'Had a space' : null,
    }
  }
  const words = raw.split(' ').filter(Boolean)
  if (words.length <= 1)
    return { givenName: raw, middleName: null, familyName: null, why: 'One word' }
  if (words.length === 2)
    return { givenName: words[0]!, middleName: null, familyName: words[1]!, why: null }
  return {
    givenName: words[0]!,
    middleName: words.slice(1, -1).join(' '),
    familyName: words[words.length - 1]!,
    why: 'Several words',
  }
}

/**
 * The name as it is shown (FR-049): a Chinese family name goes first with no space (李雯); a
 * Latin one goes last, after any middle name (Mary Jane Watson).
 */
export function displayName(parts: NameParts): string {
  const { givenName, middleName, familyName } = parts
  if (familyName && CJK.test(familyName) && CJK.test(givenName)) {
    return `${familyName}${middleName ?? ''}${givenName}`
  }
  return [givenName, middleName, familyName].filter((p) => p && p.trim() !== '').join(' ')
}

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

/**
 * The letters on a person's avatar (FR-049): given and family initials for a Latin name (Mira Chen
 * MC, never the middle name), the first two letters of a lone given name (Cher CH), the surname's
 * first character for a Chinese one (李雯 李, 欧阳娜娜 欧), and a lone Chinese given name's first.
 */
export function avatarInitials(parts: Pick<NameParts, 'givenName' | 'familyName'>): string {
  const given = parts.givenName.trim()
  const family = parts.familyName?.trim() ?? ''
  const first = (w: string) => [...w][0] ?? ''
  if (family && CJK.test(first(family))) return first(family)
  if (CJK.test(first(given))) return first(given)
  if (family) return (first(given) + first(family)).toLocaleUpperCase()
  return [...given].slice(0, 2).join('').toLocaleUpperCase()
}
