import { Fragment, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { KEY } from '../../platform/ui/buttonStyles'
import { BarCollapseIcon, BarExpandIcon } from '../../platform/ui/icons'
import { PAGES_BEFORE_THE_LINE, PLACES } from './places'
import { KIND_TEXT } from '../../platform/ui/kinds'
import { LAYER } from '../../platform/ui/layers'

/**
 * What a cell says beside it while the bar shows icons only, on the float layer (FR-019, DES-001
 * section 4): the keyboard on it at once; the pointer once it has rested `REST` ms, then at once on
 * each cell it moves to until it leaves the bar, so sweeping across does not flash a tip at each.
 * The browser's own `title` takes a second to come and sometimes never does.
 */
const TIP = `pointer-events-none absolute top-1/2 left-full ml-2.5 hidden -translate-y-1/2 items-center gap-2 rounded-control bg-float px-2 py-1 text-ui whitespace-nowrap text-ink shadow-float group-focus-visible:flex data-shown:flex ${LAYER.menu}`
const REST = 300

/** Which cell's tip the pointer has brought up, and the handlers each cell and the bar take. */
function usePointerTip() {
  const [shown, setShown] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // A tip has shown since the pointer came onto the bar: the next cell's comes at once.
  const warm = useRef(false)
  return {
    shown,
    cell: (id: string) => ({
      onPointerEnter: () => {
        clearTimeout(timer.current)
        if (warm.current) setShown(id)
        else
          timer.current = setTimeout(() => {
            warm.current = true
            setShown(id)
          }, REST)
      },
      onPointerLeave: () => {
        clearTimeout(timer.current)
        setShown(null)
      },
    }),
    bar: {
      onPointerLeave: () => {
        clearTimeout(timer.current)
        warm.current = false
        setShown(null)
      },
    },
  }
}

/**
 * THE ICON BAR (FR-019): 52 wide, a 36px cell per entry, icons only until the button at the foot
 * expands it to names and keys, 216 wide: room for "Communication" and its key. Hovering, or the
 * keyboard, shows the name and the key beside the icon. The current module's cell is selected; a kind's icon wears the kind's colour,
 * a page's is grey. Expanding it leaves the sidebar where it is; `[` is what hides that.
 */
export function IconBar({
  expanded,
  setExpanded,
}: {
  expanded: boolean
  setExpanded: (v: boolean) => void
}) {
  const Foot = expanded ? BarCollapseIcon : BarExpandIcon
  const tip = usePointerTip()
  return (
    <nav
      {...tip.bar}
      aria-label="Modules"
      className={`flex shrink-0 flex-col gap-1 border-r border-line bg-chrome pt-2 pb-2 ${
        expanded ? 'w-54' : 'w-icon-bar'
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
            {...tip.cell(p.id)}
            className={({ isActive }) =>
              `group relative mx-2 flex h-9 items-center gap-2.5 rounded-card px-2 text-ui text-muted hover:bg-hover hover:text-ink ${
                isActive ? 'bg-select font-medium text-ink' : ''
              }`
            }
          >
            <p.icon size={20} aria-hidden="true" className={p.kind ? KIND_TEXT[p.kind] : ''} />
            {expanded && <span className="flex-1 truncate">{p.label}</span>}
            {expanded && <kbd className={KEY}>G {p.key.toUpperCase()}</kbd>}
            {!expanded && (
              <span
                aria-hidden="true"
                data-icon-tip
                data-shown={tip.shown === p.id || undefined}
                className={TIP}
              >
                {p.label}
                <kbd className={KEY}>G {p.key.toUpperCase()}</kbd>
              </span>
            )}
          </NavLink>
        </Fragment>
      ))}
      <span aria-hidden="true" className="flex-1" />
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-label={expanded ? 'Show icons only' : 'Show names'}
        aria-expanded={expanded}
        {...tip.cell('expand')}
        className="group relative mx-2 flex h-9 items-center gap-2.5 rounded-card px-2 text-ui text-muted hover:bg-hover hover:text-ink"
      >
        <Foot size={16} aria-hidden="true" className="mx-0.5" />
        {expanded && <span className="flex-1 truncate text-left">Collapse</span>}
        {!expanded && (
          <span
            aria-hidden="true"
            data-icon-tip
            data-shown={tip.shown === 'expand' || undefined}
            className={TIP}
          >
            Show names
          </span>
        )}
      </button>
    </nav>
  )
}
