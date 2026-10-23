import { OBJECT_TYPES, type ObjectType } from '@ctws/contracts'
import { createContext, type ReactNode } from 'react'

/** A mention in a note: the thing it names, and the words it was written with. */
export type Mention = { type: ObjectType; id: string; words: string }

/**
 * How a mention is drawn where notes are read (FR-042): the shell gives one, a chip that opens the
 * thing. With none, a mention is its words, never a link: its address goes nowhere outside the app.
 */
export const MentionContext = createContext<((mention: Mention) => ReactNode) | null>(null)

const ADDRESS = /^ctws:\/\/([a-z]+)\/([0-9a-f-]{36})$/i

/** The thing a `ctws://` address names, if it is one of ours. */
export function mentionOf(href: string | undefined): Omit<Mention, 'words'> | null {
  const m = ADDRESS.exec(href ?? '')
  if (!m) return null
  const type = OBJECT_TYPES.find((t) => t === m[1]!.toLowerCase())
  return type ? { type, id: m[2]!.toLowerCase() } : null
}

/** A mention as notes store it: `[@words](ctws://kind/id)`. */
const STORED = /\[(@[^\]\n]+)\]\((ctws:\/\/[a-z]+\/[0-9a-f-]{36})\)/gi

/**
 * Notes as they are typed (I-09): each mention is its words, `@Mira Chen`, never its address, which
 * nobody can read and a slip of the cursor breaks. `links` remembers where each set of words goes.
 */
export function mentionsAsWords(source: string): { text: string; links: Map<string, string> } {
  const links = new Map<string, string>()
  const text = source.replace(STORED, (_, words: string, href: string) => {
    if (!links.has(words)) links.set(words, href)
    return words
  })
  return { text, links }
}

/** Back to how notes store them: each remembered `@words` its link again, the longest first. */
export function mentionsAsLinks(text: string, links: ReadonlyMap<string, string>): string {
  if (links.size === 0) return text
  const words = [...links.keys()].sort((a, b) => b.length - a.length)
  const literal = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const any = new RegExp(words.map(literal).join('|'), 'g')
  return text.replace(any, (w) => `[${w}](${links.get(w)!})`)
}
