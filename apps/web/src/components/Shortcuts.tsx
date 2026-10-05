import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { resolveChord } from '../modules/registry'
import { CHORD_TIMEOUT_MS, JUMP_PREFIX } from '../shortcuts/chords'
import { useShortcutsEnabled } from '../shortcuts/enabled'
import { isBareKey, isTypingTarget } from '../shortcuts/keys'
import { isOverlayOpen } from './overlayState'
import { SearchDialog } from './SearchDialog'
import { ShortcutHelp } from './ShortcutHelp'

const button =
  'rounded-md px-2 py-1.5 text-sm text-fg-muted hover:text-fg whitespace-nowrap flex items-center gap-1.5'
const hint =
  'pointer-events-none rounded border border-border-strong px-1.5 text-xs leading-5 max-sm:hidden'

/**
 * The document-level keys, and the two buttons that do the same jobs with a mouse.
 *
 * `f` for search, not `/`: `/` already goes to the capture box and moving it would retrain a
 * habit the user already has. `Ctrl+K` was rejected because Chrome gives it to the address bar.
 * `?` lists everything, and is also the only way to find the switch that turns these off -- which
 * is why both overlays have a visible button as well: with the single-key shortcuts disabled,
 * `?` cannot be the only route to the setting that disabled them.
 *
 * WHERE the `g` chords go is no longer written in here: the shell and each module contribute to
 * one key table and this component only runs it (module-boundary contract §3).
 */
export function Shortcuts() {
  const [search, setSearch] = useState(false)
  const [help, setHelp] = useState(false)
  const enabled = useShortcutsEnabled()
  const navigate = useNavigate()
  const qc = useQueryClient()
  // A pending `g`, and the timer that forgets it. Without the timeout a stray `g` would turn the
  // next `t` typed anywhere outside a field into a navigation.
  const pending = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!enabled) return
    const forget = () => {
      pending.current = false
      if (timer.current) clearTimeout(timer.current)
    }
    const onKey = (e: KeyboardEvent) => {
      // A chord must never fire out of a text field: `g` then `t` is two letters of a word.
      if (isTypingTarget(e.target) || !isBareKey(e)) {
        forget()
        return
      }
      if (pending.current) {
        forget()
        const chord = resolveChord(e.key)
        if (chord) {
          // The key is consumed whether or not the destination can be resolved yet: a chord that
          // fell through to the page's own `t` handler would be worse than one that did nothing.
          e.preventDefault()
          const to = chord.resolve({ queryClient: qc })
          if (to) navigate(to)
        }
        return
      }
      // An open overlay owns the keyboard; otherwise `f` on the shortcut list would stack a
      // search dialog over it.
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
    // Deliberately NOT re-run on every render: a re-render between `g` and its second key would
    // run the cleanup and forget the pending chord.
  }, [enabled, navigate, qc])

  return (
    <>
      <button type="button" onClick={() => setSearch(true)} className={button}>
        搜索
        <kbd aria-hidden="true" className={hint}>
          f
        </kbd>
      </button>
      <button
        type="button"
        onClick={() => setHelp(true)}
        aria-label="键盘快捷键"
        className={button}
      >
        <kbd aria-hidden="true" className={hint}>
          ?
        </kbd>
        <span className="sm:hidden">快捷键</span>
      </button>
      {search && <SearchDialog onClose={() => setSearch(false)} />}
      {help && <ShortcutHelp onClose={() => setHelp(false)} />}
    </>
  )
}
