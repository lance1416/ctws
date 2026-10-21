import { Fragment } from 'react'
import { NavLink } from 'react-router-dom'
import { KEY } from '../../platform/ui/buttonStyles'
import { BarCollapseIcon, BarExpandIcon } from '../../platform/ui/icons'
import { KIND_TEXT, PAGES_BEFORE_THE_LINE, PLACES } from './places'

/**
 * THE ICON BAR (FR-019): 52 wide, a 36px cell per entry, icons only until the button at the foot
 * expands it to names and keys. Hovering shows the name and the key. The current module's cell is
 * selected; a kind's icon wears the kind's colour, a page's is grey.
 */
export function IconBar({
  expanded,
  setExpanded,
}: {
  expanded: boolean
  setExpanded: (v: boolean) => void
}) {
  const Foot = expanded ? BarCollapseIcon : BarExpandIcon
  return (
    <nav
      aria-label="Modules"
      className={`flex shrink-0 flex-col gap-1 border-r border-line bg-chrome pt-2 pb-2 ${
        expanded ? 'w-50' : 'w-icon-bar'
      }`}
    >
      {PLACES.map((p, i) => (
        <Fragment key={p.id}>
          {i === PAGES_BEFORE_THE_LINE && (
            <hr aria-hidden="true" className="mx-3.5 my-1.5 border-0 border-t border-line" />
          )}
          <NavLink
            to={p.to}
            end={p.to === '/'}
            aria-label={p.label}
            title={`${p.label}  G ${p.key.toUpperCase()}`}
            className={({ isActive }) =>
              `mx-2 flex h-9 items-center gap-2.5 rounded-card px-2 text-ui text-muted hover:bg-hover hover:text-ink ${
                isActive ? 'bg-select font-medium text-ink' : ''
              }`
            }
          >
            <p.icon size={20} aria-hidden="true" className={p.kind ? KIND_TEXT[p.kind] : ''} />
            {expanded && <span className="flex-1 truncate">{p.label}</span>}
            {expanded && <kbd className={KEY}>G {p.key.toUpperCase()}</kbd>}
          </NavLink>
        </Fragment>
      ))}
      <span aria-hidden="true" className="flex-1" />
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-label={expanded ? 'Show icons only' : 'Show names'}
        aria-expanded={expanded}
        className="mx-2 flex h-9 items-center gap-2.5 rounded-card px-2 text-ui text-muted hover:bg-hover hover:text-ink"
      >
        <Foot size={16} aria-hidden="true" className="mx-0.5" />
        {expanded && <span className="flex-1 truncate text-left">Collapse</span>}
        {expanded && <kbd className={KEY}>[</kbd>}
      </button>
    </nav>
  )
}
