import { OBJECT_TYPES, type ObjectType } from '@ctws/contracts'

/**
 * An @-mention in Markdown text (FR-042): an ordinary link whose address names a thing by type
 * and id, `[@Mira Chen](ctws://person/<uuid>)`. Writing it as a link keeps the Markdown pipeline
 * as it is and reads plainly as text; the name inside the brackets is what was typed, and does
 * not follow a later rename, as in Bear or Obsidian.
 */
export type Mention = {
  type: ObjectType
  id: string
  /** The sentence the mention sits in, trimmed; the far end's page shows it. */
  excerpt: string
}

/** The most of a sentence an excerpt keeps. */
const EXCERPT_MAX = 200

const TYPES = OBJECT_TYPES.join('|')
const MENTION = new RegExp(String.raw`\[@[^\]\n]+\]\(ctws://(${TYPES})/([0-9a-fA-F-]{36})\)`, 'g')

/** Where one sentence ends and the next begins: a full stop in either script, or a line. */
const SENTENCE_END = /(?<=[。．.!?！？\n])/

/** The address of a mention of `thing`, for the editor to insert. */
export const mentionAddress = (type: ObjectType, id: string): string => `ctws://${type}/${id}`

/**
 * Every mention in `text`, in order, each with the sentence it is in. The same thing mentioned in
 * two sentences is two mentions; mentioned twice in one sentence, one.
 */
export function mentionsIn(text: string | null | undefined): Mention[] {
  if (!text) return []
  const out: Mention[] = []
  const seen = new Set<string>()
  for (const sentence of text.split(SENTENCE_END)) {
    const excerpt = sentence.trim().slice(0, EXCERPT_MAX)
    for (const m of sentence.matchAll(MENTION)) {
      const type = m[1] as ObjectType
      const id = m[2]!.toLowerCase()
      const key = `${type}:${id}:${excerpt}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ type, id, excerpt })
    }
  }
  return out
}
