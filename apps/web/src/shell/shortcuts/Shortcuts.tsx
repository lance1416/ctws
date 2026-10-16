import { KeyHint } from '../../platform/ui/KeyHint'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRegistry } from '../registry'
import { CHORD_TIMEOUT_MS, JUMP_PREFIX } from './chords'
import { useShortcutsEnabled } from '../../platform/keyboard/enabled'
import { isBareKey, isTypingTarget } from '../../platform/keyboard/keys'
import { isOverlayOpen } from '../../platform/keyboard/overlayState'
import { SearchDialog } from '../search/SearchDialog'
import { ShortcutHelp } from './ShortcutHelp'

const button =
  'rounded-md px-2 py-1.5 text-sm text-ink-muted hover:text-ink whitespace-nowrap flex items-center gap-1.5'
const hint =
  'pointer-events-none rounded border border-rule-strong px-1.5 text-xs leading-5 max-sm:hidden'

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
  const enabled = useShortcutsEnabled()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const registry = useRegistry()
  // A pending `g`, forgotten after a timeout so a stray `g` does not make a later `t` navigate.
  const pending = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!enabled) return
    const forget = () => {
      pending.current = false
      if (timer.current) clearTimeout(timer.current)
    }
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || !isBareKey(e)) {
        forget()
        return
      }
      if (pending.current) {
        forget()
        const chord = registry.chordFor(e.key)
        if (chord) {
          // Consumed even when unresolved, so it never falls through to the page's own handler.
          e.preventDefault()
          const to = chord.resolve({ queryClient: qc })
          if (to) navigate(to)
        }
        return
      }
      if (isOverlayOpen()) return
      if (e.key === JUMP_PREFIX) {
        pending.current = true
        timer.current = setTimeout(forget, CHORD_TIMEOUT_MS)
      } else if (e.key === 'f') {
        e.preventDefault()
        setSearch(true)
      } else if (e.key === '?') {
        e.preventDefault()
        setHelp(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      forget()
    }
    // Deliberately narrow: re-running between `g` and its second key would forget the chord.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setSearch is the parent's state setter.
  }, [enabled, navigate, qc, registry])

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
