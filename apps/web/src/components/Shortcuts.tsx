import { useEffect, useState } from 'react'
import { isBareKey, isTypingTarget } from '../shortcuts/keys'
import { isOverlayOpen } from './overlayState'
import { SearchDialog } from './SearchDialog'

const button =
  'rounded-md px-2 py-1.5 text-sm text-fg-muted hover:text-fg whitespace-nowrap flex items-center gap-1.5'
const hint =
  'pointer-events-none rounded border border-border-strong px-1.5 text-xs leading-5 max-sm:hidden'

/**
 * The document-level keys, and the buttons that do the same jobs with a mouse.
 *
 * `f` for search, not `/`: `/` already goes to the capture box and moving it would retrain a
 * habit the user already has. `Ctrl+K` was rejected because Chrome gives it to the address bar.
 */
export function Shortcuts() {
  const [search, setSearch] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || !isBareKey(e)) return
      // An open overlay owns the keyboard; otherwise `f` would stack a second dialog over it.
      if (isOverlayOpen()) return
      if (e.key === 'f') {
        e.preventDefault()
        setSearch(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <button type="button" onClick={() => setSearch(true)} className={button}>
        搜索
        <kbd aria-hidden="true" className={hint}>
          f
        </kbd>
      </button>
      {search && <SearchDialog onClose={() => setSearch(false)} />}
    </>
  )
}
