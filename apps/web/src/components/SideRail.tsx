import { useQuery } from '@tanstack/react-query'
import { NavLink } from 'react-router-dom'
import { listProjects } from '../api/projects'
import { moduleDestinations } from '../modules/registry'
import { railClass } from '../projectColor'

/**
 * The left column: where you can go, and how much is waiting there.
 *
 * It replaces the three nav links that used to sit in the top bar. The reason is not symmetry
 * with other apps -- it is that a destination with a NUMBER beside it answers "what is pressing"
 * before you click anything, and the top bar had no room for numbers. The project list carries
 * its open-task count and its identity chip, which also closes D47 (the project list showed
 * nothing but names).
 *
 * The destinations are no longer written in here: each MODULE contributes its own, and the rail
 * renders whatever is registered (module-boundary contract §3). The project list below them is
 * the shell's own -- the user's life is organised by line of work, and a note about CTWS belongs
 * to CTWS as much as a task does.
 *
 * Deliberately NOT a <ul>/<li>: the pages below render their own lists, and a second set of
 * listitems in the chrome would make "how many rows does this page have" unanswerable, for the
 * reader and for the tests alike.
 */
export function SideRail() {
  // Shares its cache entry with the pages that own it, so the rail costs one extra request per
  // session, not one per navigation.
  const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects })

  return (
    <nav
      aria-label="主导航"
      // Chrome, not work: the rail, the top bar and the detail pane share ONE surface
      // (`sunken`), and the centre column keeps `surface`. That is the whole figure/ground
      // device -- no cards, no shadows, no hairline round everything, just two planes. It reads
      // in both schemes because `sunken` is darker than `surface` in each: a lighter sheet of
      // work in light mode, a brighter one in dark.
      className="flex flex-col gap-1 border-border-subtle bg-surface-sunken max-lg:flex-row max-lg:items-center max-lg:overflow-x-auto max-lg:border-b max-lg:px-4 max-lg:py-2 lg:h-[calc(100vh-3.75rem)] lg:gap-0 lg:overflow-y-auto lg:border-r lg:py-4 lg:pr-3 lg:pl-4"
    >
      {/* One hook per registered count, over a frozen module list: see MODULES on why the list
          must not change at runtime. */}
      {moduleDestinations().map(({ moduleId, id, to, label, end, Count }) => (
        <NavLink
          key={`${moduleId}:${id}`}
          to={to}
          end={end ?? false}
          className={({ isActive }) =>
            `flex min-h-9 shrink-0 items-center gap-2 rounded-lg px-2.5 py-1 whitespace-nowrap ${
              isActive ? 'bg-surface-panel font-semibold text-fg' : 'text-fg-muted hover:text-fg'
            }`
          }
        >
          <span>{label}</span>
          {Count && <Count />}
        </NavLink>
      ))}

      {/* The group label is itself the link to the full project page: one control, so there is
          never a label that looks clickable next to a link that is. */}
      <NavLink
        to="/projects"
        className={({ isActive }) =>
          `mt-0 shrink-0 rounded-lg px-2.5 py-1 font-semibold whitespace-nowrap lg:mt-6 lg:text-xs ${
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
              `flex min-h-11 items-center gap-2.5 rounded-lg py-1 pr-2 pl-2.5 ${
                // The current page wears the WORK surface, so the rail says "you are over
                // there" with the same two planes the layout already uses.
                isActive ? 'bg-surface-panel text-fg' : 'text-fg-muted hover:text-fg'
              }`
            }
          >
            <span
              aria-hidden="true"
              className={`h-4 w-[3px] shrink-0 rounded-full ${railClass(p.color)}`}
            />
            <span className="truncate">{p.name}</span>
            {p.openTasks > 0 && (
              <span data-count className="ml-auto pl-1 text-sm text-fg-subtle tabular-nums">
                {p.openTasks}
              </span>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
