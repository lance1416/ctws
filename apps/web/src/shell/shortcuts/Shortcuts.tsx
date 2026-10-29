import { useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Creator } from '../contract'
import { useRegistry } from '../registry'
import { CHORD_TIMEOUT_MS, JUMP_PREFIX, NEW_PREFIX, PIN_LINK_KEY } from './chords'
import { useDocumentKeys } from '../../platform/keyboard/keyTable'
import { SearchDialog } from '../search/SearchDialog'
import { ShortcutHelp } from './ShortcutHelp'

/**
 * The document-level keys, and the two overlays they open. The top bar's buttons do the same jobs
 * from the same state, which is the layout's: the `?` overlay holds the switch that turns the keys
 * off, so it cannot be reachable only by a key. `G` and `N` are prefixes: the next key is a
 * jump's or a creator's, and is consumed even when it names none.
 */
export function Shortcuts({
  search,
  setSearch,
  help,
  setHelp,
  onSidebar,
  onLink,
  onNew,
  onPinLink,
}: {
  search: boolean
  setSearch: (open: boolean) => void
  help: boolean
  setHelp: (open: boolean) => void
  onSidebar: () => void
  onLink: () => void
  onNew: (creator: Creator) => void
  /** N L: a link, hung where you are (FR-029). */
  onPinLink: () => void
}) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const registry = useRegistry()
  // A pending prefix, forgotten after a timeout so a stray `g` does not make a later `t` navigate.
  const pending = useRef<typeof JUMP_PREFIX | typeof NEW_PREFIX | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const forget = () => {
    pending.current = null
    if (timer.current) clearTimeout(timer.current)
  }
  const expect = (prefix: typeof JUMP_PREFIX | typeof NEW_PREFIX) => {
    pending.current = prefix
    timer.current = setTimeout(forget, CHORD_TIMEOUT_MS)
  }

  useDocumentKeys(
    registry.anywhere,
    {
      search: () => setSearch(true),
      help: () => setHelp(true),
      sidebar: onSidebar,
      link: onLink,
      jump: () => expect(JUMP_PREFIX),
      new: () => expect(NEW_PREFIX),
    },
    {
      claim: (e) => {
        const prefix = pending.current
        if (prefix === null) return false
        forget()
        // The key after a prefix is the chord's, named or not: it reaches nothing else (BUG-018).
        e.preventDefault()
        if (prefix === JUMP_PREFIX) {
          const chord = registry.chordFor(e.key)
          if (chord) {
            e.preventDefault()
            const to = chord.resolve({ queryClient: qc })
            if (to) navigate(to)
          }
        } else if (e.key === PIN_LINK_KEY) {
          onPinLink()
        } else {
          const creator = registry.creatorFor(e.key)
          if (creator) {
            e.preventDefault()
            onNew(creator)
          }
        }
        return true
      },
      skipped: forget,
    },
  )

  return (
    <>
      {search && <SearchDialog onClose={() => setSearch(false)} />}
      {help && <ShortcutHelp onClose={() => setHelp(false)} />}
    </>
  )
}
