import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { KEY, ICON_BUTTON } from '../../platform/ui/buttonStyles'
import { DarkIcon, LightIcon, PLACE_ICON } from '../../platform/ui/icons'
import { applyTheme, onSchemeChange, shownScheme } from '../../platform/ui/theme'
import { keyLabel } from '../../platform/keyboard/keys'
import { Capture } from '../capture'
import { Breadcrumbs } from './Breadcrumbs'
import { OfflinePill } from './Online'
import { UserMenu } from './UserMenu'
import { WriteFailure } from './WriteFailure'

/**
 * THE TOP BAR (FR-018), 48 high on every page: the mark, where you are, search, capture, the keys,
 * the theme and the account. Not on the phone, whose frame is the tab bar (FR-082).
 */
export function TopBar({
  email,
  onSearch,
  onHelp,
  onLogout,
}: {
  email: string
  onSearch: () => void
  onHelp: () => void
  onLogout: () => void
}) {
  return (
    // Three columns, the outer two equal: the search and capture stay centred whatever appears at
    // either end (the Offline pill, a long breadcrumb).
    <header className="grid h-12 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border-b border-line bg-chrome pr-3 pl-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          to="/"
          aria-label="Workbench"
          className="inline-grid size-7.5 shrink-0 place-items-center rounded-card bg-ink text-meta font-medium text-on-ink"
        >
          CT
        </Link>
        <Breadcrumbs />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSearch}
          className="flex h-7.5 w-90 shrink items-center gap-2 rounded-control border border-line-strong bg-panel px-2.5 text-ui text-subtle hover:bg-hover"
        >
          <PLACE_ICON.search size={16} aria-hidden="true" />
          <span className="flex-1 text-left">Search everything</span>
          <kbd className={KEY}>{keyLabel('Ctrl K')}</kbd>
        </button>
        <Capture />
      </div>
      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onHelp}
          aria-label="Keys"
          title="Keys  ?"
          className={ICON_BUTTON}
        >
          <PLACE_ICON.keys size={16} aria-hidden="true" />
        </button>
        <ThemeSwitch />
        {/* Next to the account (FR-033), so the middle of the bar never moves. */}
        <OfflinePill />
        <span className="relative">
          <UserMenu email={email} onLogout={onLogout} />
          {/* Any write that fails unsaid, signing out among them, is said here. */}
          <WriteFailure />
        </span>
      </div>
    </header>
  )
}

/** Light or dark by hand; following the system is on the account page (FR-005, artboard 30). */
function ThemeSwitch() {
  const [scheme, setScheme] = useState<'light' | 'dark'>(() => shownScheme())
  useEffect(() => onSchemeChange(() => setScheme(shownScheme())), [])
  const other = scheme === 'dark' ? 'light' : 'dark'
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
