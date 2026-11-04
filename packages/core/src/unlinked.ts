import type { ObjectType } from '@ctws/contracts'
import { CJK } from './people/names'
import { mentionsIn, sentencesOf } from './mentions'

/** One place a thing is named without being mentioned: the sentence, and where in it. */
export type Unlinked = {
  excerpt: string
  /** The name's place in `excerpt`, UTF-16 units, end exclusive. */
  start: number
  end: number
}

/** The fewest letters a Latin name is looked for with, and Han characters a Chinese one. */
const MIN_LATIN = 3
const MIN_HAN = 2

/** A name worth looking for: long enough not to turn up everywhere. */
export function findable(name: string): boolean {
  const n = name.trim()
  if (CJK.test(n)) return [...n].filter((c) => CJK.test(c)).length >= MIN_HAN
  return [...n].filter((c) => /\p{L}/u.test(c)).length >= MIN_LATIN
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * A pattern for a name: a Latin one as a whole word, whatever its case ("Atlas" not in
 * "Atlases"); a Chinese one as written, since Chinese has no spaces to make words of.
 */
function patternOf(name: string): RegExp {
  const n = name.trim()
  if (CJK.test(n)) return new RegExp(escape(n), 'gu')
  return new RegExp(`(?<![\\p{L}\\p{N}])${escape(n)}(?![\\p{L}\\p{N}])`, 'giu')
}

/** Markdown links in a sentence, a mention included: a name inside one is already a link. */
const LINK = /\[[^\]\n]*\]\([^)\s]*\)/g

/**
 * The sentences of `text` that name `target` by one of `names` without mentioning it: one an
 * occurrence, the longest name that fits there winning, none inside a link, and none in a
 * sentence that mentions the thing already.
 */
export function unlinkedIn(
  text: string,
  names: readonly string[],
  target: { type: ObjectType; id: string },
): Unlinked[] {
  const wanted = [...new Set(names.map((n) => n.trim()))]
    .filter(findable)
    .sort((a, b) => b.length - a.length)
  if (wanted.length === 0) return []
  const out: Unlinked[] = []
  for (const sentence of sentencesOf(text)) {
    const excerpt = sentence.trim()
    if (mentionsIn(excerpt).some((m) => m.type === target.type && m.id === target.id)) continue
    const taken: { start: number; end: number }[] = [...excerpt.matchAll(LINK)].map((m) => ({
      start: m.index,
      end: m.index + m[0].length,
    }))
    const found: Unlinked[] = []
    for (const name of wanted) {
      for (const m of excerpt.matchAll(patternOf(name))) {
        const span = { start: m.index, end: m.index + m[0].length }
        if (taken.some((t) => span.start < t.end && t.start < span.end)) continue
        taken.push(span)
        found.push({ excerpt, ...span })
      }
    }
    out.push(...found.sort((a, b) => a.start - b.start))
  }
  return out
}

/**
 * `text` with the one unlinked name `at` describes turned into a mention of `target`, its words
 * as they were written. Null when that sentence, or that name in it, is no longer there: the text
 * changed since it was read.
 */
export function linkUnlinked(
  text: string,
  at: Unlinked,
  target: { type: ObjectType; id: string },
): string | null {
  const sentenceAt = text.indexOf(at.excerpt)
  if (sentenceAt < 0 || text.indexOf(at.excerpt, sentenceAt + 1) >= 0) return null
  const words = at.excerpt.slice(at.start, at.end)
  if (words.length === 0 || /[\]\n]/.test(words)) return null
  const from = sentenceAt + at.start
  const to = sentenceAt + at.end
  return `${text.slice(0, from)}[@${words}](ctws://${target.type}/${target.id})${text.slice(to)}`
}
