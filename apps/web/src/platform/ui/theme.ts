/**
 * Light, dark, or the system's. The choice is kept in localStorage and set on <html> by a script
 * in `index.html` before React mounts, so a reload never flashes the other scheme.
 */
export type Theme = 'light' | 'dark' | 'system'

const KEY = 'ctws:theme'

export function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY)
    return saved === 'light' || saved === 'dark' ? saved : 'system'
  } catch {
    // A private window can refuse localStorage; follow the system then.
    return 'system'
  }
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
  try {
    if (theme === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, theme)
  } catch {
    // Not kept, but this page still shows the choice.
  }
}

const SYSTEM_DARK = '(prefers-color-scheme: dark)'

/** The scheme the page shows now: the chosen one, else the system's. */
export function shownScheme(): 'light' | 'dark' {
  const chosen = document.documentElement.getAttribute('data-theme')
  if (chosen === 'light' || chosen === 'dark') return chosen
  return window.matchMedia(SYSTEM_DARK).matches ? 'dark' : 'light'
}

/** Calls `listener` when `shownScheme` may have changed: a choice here, or the system's. */
export function onSchemeChange(listener: () => void): () => void {
  const system = window.matchMedia(SYSTEM_DARK)
  system.addEventListener('change', listener)
  const chosen = new MutationObserver(listener)
  chosen.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  return () => {
    system.removeEventListener('change', listener)
    chosen.disconnect()
  }
}
