import { useQuery } from '@tanstack/react-query'
import { Fragment } from 'react'
import { Link, NavLink, useMatch } from 'react-router-dom'
import { archivedProjectsQuery, useProjects } from './api'
import { useRegistry } from '../registry'
import { SidebarHead } from '../layout/Sidebar'
import { ProjectSquare } from './ProjectSquare'
import { showArchived, useArchivedShown } from './archivedShown'
import { ICON_BUTTON } from '../../platform/ui/buttonStyles'
import { CollapseIcon, NewIcon } from '../../platform/ui/icons'

/**
 * The Projects sidebar (FR-020): the inbox, then every live project with how much waits in it,
 * then the archived ones behind their count, listed when it is opened (FR-051). Under the open
 * project, its outline (FR-021).
 */
export function ProjectsSidebar() {
  const projects = useProjects()
  const archived = useQuery(archivedProjectsQuery())
  const archivedShown = useArchivedShown()
  const registry = useRegistry()
  const Outline = registry.projectOutline
  const open = useMatch('/projects/:id')?.params.id

  const live = projects.data ?? []
  const inbox = live.find((p) => p.isInbox)
  const others = live.filter((p) => !p.isInbox)
  const row = ({ isActive }: { isActive: boolean }) =>
    `mx-1.5 flex h-7.5 items-center gap-2 rounded-control px-2 text-ui hover:bg-hover ${
      isActive ? 'bg-select font-medium text-ink' : 'text-ink'
    }`

  return (
    <aside
      aria-label="Projects"
      className="flex w-sidebar shrink-0 flex-col border-r border-line bg-chrome"
    >
      <SidebarHead
        label="Projects"
        action={
          <Link
            to="/projects/new"
            aria-label="New project"
            title="New project"
            className={ICON_BUTTON}
          >
            <NewIcon size={16} aria-hidden="true" />
          </Link>
        }
      >
        {projects.data && others.length}
      </SidebarHead>
      {/* Every row keeps its height; past the bottom the list scrolls in here (U-06). */}
      <nav
        aria-label="Projects"
        className="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto pb-2 *:shrink-0"
      >
        {inbox && (
          <NavLink to={`/projects/${inbox.id}`} className={row}>
            <ProjectSquare project={inbox} />
            <span className="flex-1 truncate">{inbox.name}</span>
            <Waiting n={registry.projectCount?.(inbox) ?? 0} />
          </NavLink>
        )}
        {others.map((p) => (
          <Fragment key={p.id}>
            <NavLink to={`/projects/${p.id}`} className={row}>
              <ProjectSquare project={p} />
              <span className="flex-1 truncate">{p.name}</span>
              <Waiting n={registry.projectCount?.(p) ?? 0} />
            </NavLink>
            {Outline && p.id === open && <Outline projectId={p.id} />}
          </Fragment>
        ))}
        {archived.data && archived.data.length > 0 && (
          <>
            <button
              type="button"
              aria-expanded={archivedShown}
              onClick={() => showArchived(!archivedShown)}
              className={`${row({ isActive: false })} mt-2 text-subtle`}
            >
              <CollapseIcon
                size={14}
                aria-hidden="true"
                className={`mx-0.75 transition-transform ${archivedShown ? 'rotate-90' : ''}`}
              />
              <span className="flex-1 text-left">Archived</span>
              <Waiting n={archived.data.length} />
            </button>
            {archivedShown &&
              archived.data.map((p) => (
                <NavLink key={p.id} to={`/projects/${p.id}`} className={row}>
                  <ProjectSquare project={p} />
                  <span className="flex-1 truncate text-muted">{p.name}</span>
                </NavLink>
              ))}
          </>
        )}
      </nav>
    </aside>
  )
}

/** How much waits in a project; nothing is shown as nothing. */
function Waiting({ n }: { n: number }) {
  if (n === 0) return null
  return (
    <span data-count className="text-meta text-subtle tabular-nums">
      {n}
    </span>
  )
}
