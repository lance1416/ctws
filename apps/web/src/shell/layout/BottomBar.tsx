import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { LAYER } from '../../platform/ui/layers'
import { useRegistry, WORKBENCH_PATH } from '../registry'

/**
 * The phone's navigation: five tabs where the rail does not fit, Search being the way to the rest.
 * It shares the rail's name, but only one of the two is ever displayed.
 */
export function BottomBar({ onSearch }: { onSearch: () => void }) {
  const registry = useRegistry()
  const today = registry.phoneTab
  const TodayCount = today.Count
  const calendar = registry.pinned.find((p) => p.key === 'shell:calendar')
  const projects = registry.kinds[0]!
  const tab =
    'flex min-w-0 flex-col items-center justify-center gap-0.5 text-xs leading-4 text-ink-muted'
  const link = ({ isActive }: { isActive: boolean }) =>
    `${tab} ${isActive ? 'font-semibold text-ink' : ''}`

  return (
    <nav
      aria-label="Main navigation"
      className={`fixed inset-x-0 bottom-0 ${LAYER.bar} grid h-16 grid-cols-5 border-t border-rule bg-chrome lg:hidden`}
    >
      <NavLink to={WORKBENCH_PATH} end className={link}>
        <Icon>
          <rect x="3.5" y="3.5" width="6" height="6" rx="1.2" />
          <rect x="12.5" y="3.5" width="6" height="6" rx="1.2" />
          <rect x="3.5" y="12.5" width="6" height="6" rx="1.2" />
          <rect x="12.5" y="12.5" width="6" height="6" rx="1.2" />
        </Icon>
        Workbench
      </NavLink>
      <NavLink to={today.to} end={today.end ?? false} className={link}>
        <Icon>
          <circle cx="11" cy="11" r="7.5" />
          <path d="M11 5.5a5.5 5.5 0 0 1 0 11z" fill="currentColor" stroke="none" />
        </Icon>
        <span className="flex items-center">
          {today.label}
          {TodayCount && <TodayCount />}
        </span>
      </NavLink>
      <NavLink to={projects.to} className={link}>
        <Icon>
          <path d="M4 4.5v13M8 6h10M8 11h10M8 16h7" />
        </Icon>
        {projects.label}
      </NavLink>
      {calendar && (
        <NavLink to={calendar.to} className={link}>
          <Icon>
            <rect x="3.5" y="5" width="15" height="13.5" rx="2" />
            <path d="M3.5 9h15M7.5 3v4M14.5 3v4" />
          </Icon>
          {calendar.label}
        </NavLink>
      )}
      <button type="button" onClick={onSearch} className={tab}>
        <Icon>
          <circle cx="10" cy="10" r="6" />
          <path d="M14.5 14.5l4 4" />
        </Icon>
        Search
      </button>
    </nav>
  )
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 22 22"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}
