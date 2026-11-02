import { useEffect, useEffectEvent } from 'react'
import { useShortcutsEnabled } from '../keyboard/enabled'
import { isTypingTarget } from '../keyboard/keys'
import { isOverlayOpen } from '../keyboard/overlayState'
import { keyDone } from './focused'

/** How the help and the switches' hovers write the keys (REQ-002 FR-109, FR-116, FR-029). */
export const OUTLINE_KEYS = '] or Ctrl+Alt+B'
export const SOURCE_KEYS = 'Ctrl+Shift+V'

/** The outline's: Ctrl Alt B, as VS Code folds its second side bar; a page can take it in Safari. */
const isOutlineKey = (e: KeyboardEvent) =>
  (e.ctrlKey || e.metaKey) && e.altKey && !e.shiftKey && e.code === 'KeyB'

const isSourceKey = (e: KeyboardEvent) =>
  (e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.code === 'KeyV'

/** Whether a press is one of the page's own, which the editor and its vim pass on untouched. */
export const isNoteKey = (e: KeyboardEvent): boolean => isOutlineKey(e) || isSourceKey(e)

/**
 * The keys of a note's whole page: `]` hides or shows the outline when nothing is being typed, as
 * `[` does the side panel; Ctrl Alt B does it anywhere, the editor too, as in VS Code; Ctrl Shift
 * V switches to the source and back, which costs nothing as the editor only ever pastes plain
 * text. Read by the key, not the character: Alt makes another one of B on a Mac. Full screen is an
 * overlay, which every page-wide key stands down for, so it binds them with `inOverlay`.
 */
export function useNoteKeys(
  { outline, source }: { outline?: (() => void) | undefined; source?: (() => void) | undefined },
  { inOverlay = false }: { inOverlay?: boolean } = {},
): void {
  const singleKeys = useShortcutsEnabled()
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (keyDone(e) || (isOverlayOpen() && !inOverlay)) return
    const mod = e.ctrlKey || e.metaKey
    let run: (() => void) | undefined
    if (isOutlineKey(e)) run = outline
    else if (isSourceKey(e)) run = source
    else if (e.key === ']' && !mod && !e.altKey && singleKeys && !isTypingTarget(e.target))
      run = outline
    if (!run) return
    e.preventDefault()
    run()
  })
  useEffect(() => {
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
}
