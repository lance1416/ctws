import { useEffect, useState } from 'react'

const KEY = 'ctws.shortcuts.enabled'
const EVENT = 'ctws:shortcuts-changed'

/**
 * Whether the single-key shortcuts are on. Per browser, not per account: it is a property of the
 * machine and its assistive technology, not of the person's data (OpenProject 16.2 ships the same
 * switch for the same reason -- single-key shortcuts steal keystrokes from a screen reader's own
 * navigation).
 *
 * Every accessor is wrapped: `localStorage` THROWS on access in a private window or with site
 * data blocked, and an uncaught throw here would blank the page. Default on, because the shortcuts
 * are the feature.
 */
export function shortcutsEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== '0'
  } catch {
    return true
  }
}

export function setShortcutsEnabled(value: boolean): void {
  try {
    localStorage.setItem(KEY, value ? '1' : '0')
  } catch {
    // The setting simply stops being remembered across reloads; this tab still honours it.
  }
  window.dispatchEvent(new Event(EVENT))
}

/**
 * The hook form. The custom event is what keeps the several independent listeners (capture, the
 * tree, the jump chords) in step with the switch inside the help overlay; `storage` alone would
 * only fire in OTHER tabs.
 */
export function useShortcutsEnabled(): boolean {
  const [on, setOn] = useState(shortcutsEnabled)
  useEffect(() => {
    const sync = () => setOn(shortcutsEnabled())
    window.addEventListener(EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  return on
}
