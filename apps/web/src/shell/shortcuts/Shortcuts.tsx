import { useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRegistry } from '../registry'
import { CHORD_TIMEOUT_MS } from './chords'
import { useDocumentKeys } from '../../platform/keyboard/keyTable'
import { SearchDialog } from '../search/SearchDialog'
import { ShortcutHelp } from './ShortcutHelp'

/**
 * The document-level keys, and the two overlays they open. The top bar's buttons do the same jobs
 * from the same state, which is the layout's: the `?` overlay holds the switch that turns the keys
 * off, so it cannot be reachable only by a key.
 */
export function Shortcuts({
  search,
  setSearch,
  help,
  setHelp,
  onSidebar,
}: {
  search: boolean
  setSearch: (open: boolean) => void
  help: boolean
  setHelp: (open: boolean) => void
  onSidebar: () => void
}) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const registry = useRegistry()
  // A pending `g`, forgotten after a timeout so a stray `g` does not make a later `t` navigate.
  const pending = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const forget = () => {
    pending.current = false
    if (timer.current) clearTimeout(timer.current)
  }

  useDocumentKeys(
    registry.anywhere,
    {
      search: () => setSearch(true),
      help: () => setHelp(true),
      sidebar: onSidebar,
      jump: () => {
        pending.current = true
        timer.current = setTimeout(forget, CHORD_TIMEOUT_MS)
      },
    },
    {
      // The key after the prefix is the chord's, whatever else it would do. It is consumed even
      // when unresolved, so it never falls through to the page's own handler.
      claim: (e) => {
        if (!pending.current) return false
        forget()
        const chord = registry.chordFor(e.key)
        if (chord) {
          e.preventDefault()
          const to = chord.resolve({ queryClient: qc })
          if (to) navigate(to)
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
