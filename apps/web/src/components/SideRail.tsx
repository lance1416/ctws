import { useQuery } from '@tanstack/react-query'
import { NavLink } from 'react-router-dom'
import { listProjects } from '../api/projects'
import { listToday } from '../api/today'
import { projectRailClass } from '../projectColor'

/**
 * The left column: where you can go, and how much is waiting there.
 *
 * It replaces the three nav links that used to sit in the top bar. The reason is not symmetry
 * with other apps -- it is that a destination with a NUMBER beside it answers "what is pressing"
 * before you click anything, and the top bar had no room for numbers. The project list carries
 * its open-task count and its identity chip, which also closes D47 (the project list showed
 * nothing but names).
 *
 * Deliberately NOT a <ul>/<li>: the pages below render their own lists, and a second set of
 * listitems in the chrome would make "how many rows does this page have" unanswerable, for the
 * reader and for the tests alike.
 */
export function SideRail() {
  // Both queries share their cache entry with the pages that own them, so the rail costs one
  // extra request per session, not one per navigation.
  const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects })
  const today = useQuery({ queryKey: ['today'], queryFn: listToday })
  // Only tasks that are actually on today's plate; the rail must not claim work that is not due.
  const todayCount = today.data?.length ?? null

  return (
    <nav
      aria-label="主导航"
      className="flex flex-col gap-1 border-border-subtle max-lg:flex-row max-lg:items-center max-lg:overflow-x-auto max-lg:border-b max-lg:px-4 max-lg:py-2 lg:h-[calc(100vh-3rem)] lg:gap-0 lg:overflow-y-auto lg:border-r lg:py-4 lg:pr-3 lg:pl-4"
    >
      <Destination to="/" label="今天" count={todayCount} end={true} />
      <Destination to="/completed" label="已完成" count={null} end={false} />

      {/* The group label is itself the link to the full project page: one control, so there is
          never a label that looks clickable next to a link that is. */}
      <NavLink
        to="/projects"
        className={({ isActive }) =>
          `mt-0 shrink-0 rounded-md px-2 py-1 text-2xs font-medium tracking-wide whitespace-nowrap lg:mt-6 ${
            isActive ? 'text-fg' : 'text-fg-muted hover:text-fg'
          }`
        }
      >
        项目
      </NavLink>

      {/* The project list belongs to wide screens: below 1024 the rail is a single row of
          destinations and the projects are one tap away on their own page, which is also where
          they can be created and deleted. */}
      <div className="hidden flex-col lg:flex">
        {projects.data?.map((p) => (
          <NavLink
            key={p.id}
            to={`/projects/${p.id}`}
            className={({ isActive }) =>
              `flex items-center gap-2 rounded-md py-1 pr-1.5 pl-2 text-sm ${
                isActive ? 'bg-surface-sunken text-fg' : 'text-fg-muted hover:text-fg'
              }`
            }
          >
            <span
              aria-hidden="true"
              className={`h-3.5 w-[3px] shrink-0 rounded-full ${projectRailClass(p.id)}`}
            />
            <span className="truncate">{p.name}</span>
            {p.openTasks > 0 && (
              <span data-count className="ml-auto pl-1 text-2xs text-fg-muted">
                {p.openTasks}
              </span>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

function Destination({
  to,
  label,
  count,
  end,
}: {
  to: string
  label: string
  count: number | null
  end: boolean
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex shrink-0 items-center gap-2 rounded-md px-2 py-1 whitespace-nowrap ${
          isActive ? 'bg-surface-sunken font-medium text-fg' : 'text-fg-muted hover:text-fg'
        }`
      }
    >
      <span>{label}</span>
      {count !== null && count > 0 && (
        <span data-count className="ml-auto pl-1 text-2xs text-fg-muted">
          {count}
        </span>
      )}
    </NavLink>
  )
}
