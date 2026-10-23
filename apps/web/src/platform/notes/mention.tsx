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
