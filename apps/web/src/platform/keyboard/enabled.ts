import { useEffect, useState } from 'react'

const KEY = 'ctws.shortcuts.enabled'
const EVENT = 'ctws:shortcuts-changed'

/** What this tab was last told, for when `localStorage` cannot hold it. */
let inThisTab = true

/**
 * Whether single-key shortcuts act (FR-029): they can steal a screen reader's keys. The account
 * keeps the choice; this is the page's copy of it, also kept in the browser so a reload starts
 * the way the account was left. Every access is wrapped, because `localStorage` throws in a
 * private window or with site data blocked.
 */
export function shortcutsEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== '0'
  } catch {
    return inThisTab
  }
}

export function setShortcutsEnabled(value: boolean): void {
  try {
    localStorage.setItem(KEY, value ? '1' : '0')
  } catch {
    // Not remembered across reloads; this tab still honours it.
    inThisTab = value
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
