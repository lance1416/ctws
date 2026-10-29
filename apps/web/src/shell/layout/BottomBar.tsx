import { NavLink } from 'react-router-dom'
import { KIND_ICON, MoreIcon, NewIcon, PLACE_ICON } from '../../platform/ui/icons'
import { LAYER } from '../../platform/ui/layers'
import { BUTTON } from '../../platform/ui/buttonStyles'
import { openCapture } from '../capture/Capture'
import { useRegistry } from '../registry'

/** The phone's More page: everything without a tab of its own (FR-085). */
export const MORE_PATH = '/more'

/**
 * THE PHONE'S TABS (FR-082, artboard 25): Today, Calendar, the capture button, People and More,
 * below 1024 where the rail and sidebar are not drawn. The tab you are on is ink and 500; the
 * workbench, the desk's starting place, is in More.
 */
export function BottomBar() {
  const registry = useRegistry()
  const today = registry.phoneTab
  const calendar = registry.pinned.find((p) => p.key === 'shell:calendar')
  const people = registry.kinds.find((k) => k.to === '/people')
  const tab = ({ isActive }: { isActive: boolean }) =>
    `flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 text-meta ${
      isActive ? 'font-medium text-ink' : 'text-muted'
    }`

  return (
    <nav
      aria-label="Main navigation"
      className={`fixed inset-x-0 bottom-0 ${LAYER.bar} grid h-[calc(4rem+env(safe-area-inset-bottom))] grid-cols-5 items-start border-t border-line bg-chrome pt-1.5 pb-[env(safe-area-inset-bottom)] lg:hidden`}
    >
      <NavLink to={today.to} end={today.end ?? false} className={tab}>
        <PLACE_ICON.today size={22} aria-hidden="true" />
        {today.label}
      </NavLink>
      {calendar && (
        <NavLink to={calendar.to} className={tab}>
          <PLACE_ICON.calendar size={22} aria-hidden="true" />
          {calendar.label}
        </NavLink>
      )}
      <span className="flex justify-center">
        <button
          type="button"
          onClick={() => openCapture()}
          aria-label="Capture"
          className={BUTTON.tab}
        >
          <NewIcon size={22} aria-hidden="true" />
        </button>
      </span>
      {people && (
        <NavLink to={people.to} className={tab}>
          <KIND_ICON.person size={22} aria-hidden="true" />
          {people.label}
        </NavLink>
      )}
      <NavLink to={MORE_PATH} className={tab}>
        <MoreIcon size={22} aria-hidden="true" />
        More
      </NavLink>
    </nav>
  )
}
