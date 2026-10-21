import { KeyHint } from '../../platform/ui/KeyHint'
import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRegistry } from '../registry'
import { CHORD_TIMEOUT_MS } from './chords'
import { useDocumentKeys } from '../../platform/keyboard/keyTable'
import { SearchDialog } from '../search/SearchDialog'
import { ShortcutHelp } from './ShortcutHelp'

const button =
  'rounded-control px-2 py-1.5 text-ui text-muted hover:text-ink whitespace-nowrap flex items-center gap-1.5'
const hint =
  'pointer-events-none rounded-key border border-line-strong px-1.5 text-meta leading-5 max-sm:hidden'

/**
 * The document-level keys, and buttons for the same jobs: the `?` overlay holds the switch that
 * turns the keys off, so it cannot be reachable only by a key. Search state is the layout's.
 */
export function Shortcuts({
  capture,
  search,
  setSearch,
}: {
  capture?: ReactNode
  search: boolean
  setSearch: (open: boolean) => void
}) {
  const [help, setHelp] = useState(false)
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
      {/* Below 1024 search is a tab in the bottom bar, and the key list is for keyboards. */}
      <button type="button" onClick={() => setSearch(true)} className={`max-lg:hidden ${button}`}>
        Search
        <KeyHint hidden className={hint}>
          f
        </KeyHint>
      </button>
      {capture}
      <button
        type="button"
        onClick={() => setHelp(true)}
        aria-label="Keyboard shortcuts"
        className={`max-lg:hidden ${button}`}
      >
        <kbd aria-hidden="true" className={hint}>
          ?
        </kbd>
      </button>
      {search && <SearchDialog onClose={() => setSearch(false)} />}
      {help && <ShortcutHelp onClose={() => setHelp(false)} />}
    </>
  )
}
