import { useEffect, useState } from 'react'

const KEY = 'ctws.shortcuts.enabled'
const EVENT = 'ctws:shortcuts-changed'

/**
 * Per browser, not per account: single-key shortcuts can steal a screen reader's keys. Every access
 * is wrapped, because `localStorage` throws in a private window or with site data blocked.
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
    // Not remembered across reloads; this tab still honours it.
  }
  window.dispatchEvent(new Event(EVENT))
}

/** The custom event keeps this tab's listeners in step; `storage` only fires in other tabs. */
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
