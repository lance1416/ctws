import type { NoteId } from '@ctws/contracts'
import { useSyncExternalStore } from 'react'

/**
 * WHAT THE NOTE'S PAGE ASKS OF THE SIDEBAR (FR-110): a new folder, made in the sidebar's own row
 * and, when a note asked for it, that note put in it ("New folder…" in Move to folder); and a note
 * shown where it is kept (the head's folder tag), its folder opened. One ask at a time.
 */
type Ask = { newFolderFor: NoteId | 'none' | null; reveal: NoteId | null; n: number }

let ask: Ask = { newFolderFor: null, reveal: null, n: 0 }
const heard = new Set<() => void>()
const tell = (next: Omit<Ask, 'n'>) => {
  ask = { ...next, n: ask.n + 1 }
  for (const h of heard) h()
}

/** A new folder's row in the sidebar; with a note, the note goes in it once it is made. */
export const askNewFolder = (forNote: NoteId | null = null) =>
  tell({ newFolderFor: forNote ?? 'none', reveal: null })

/** The note in the sidebar, its folder opened and the row scrolled to. */
export const askReveal = (note: NoteId) => tell({ newFolderFor: null, reveal: note })

/** The ask is answered. */
export const answered = () => tell({ newFolderFor: null, reveal: null })

export function useSidebarAsk(): Ask {
  return useSyncExternalStore(
    (h) => {
      heard.add(h)
      return () => heard.delete(h)
    },
    () => ask,
  )
}
