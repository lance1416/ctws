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
