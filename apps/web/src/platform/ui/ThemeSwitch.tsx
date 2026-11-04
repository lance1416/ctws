import { useEffect, useState } from 'react'
import { ICON_BUTTON } from './buttonStyles'
import { DarkIcon, LightIcon } from './icons'
import { applyTheme, onSchemeChange, shownScheme } from './theme'

/** The scheme the page shows, kept current as the choice or the system's changes. */
export function useShownScheme(): 'light' | 'dark' {
  const [scheme, setScheme] = useState<'light' | 'dark'>(() => shownScheme())
  useEffect(() => onSchemeChange(() => setScheme(shownScheme())), [])
  return scheme
}

/** Light or dark by hand; following the system is on the account page. */
export function ThemeSwitch() {
  const other = useShownScheme() === 'dark' ? 'light' : 'dark'
  const Icon = other === 'light' ? LightIcon : DarkIcon
  return (
    <button
      type="button"
      onClick={() => applyTheme(other)}
      aria-label={`Switch to ${other}`}
      title={`Switch to ${other}`}
      className={ICON_BUTTON}
    >
      <Icon size={16} aria-hidden="true" />
    </button>
  )
}
