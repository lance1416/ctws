import type { ProjectResponse } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { BUTTON } from '../../platform/ui/buttonStyles'
import { ArchiveIcon, NewIcon } from '../../platform/ui/icons'
import { PageHead } from '../../platform/ui/PageHead'
import { useRegistry } from '../registry'
import { archivedProjectsQuery, useProjects } from './api'
import { showArchived } from './archivedShown'
import { ProjectSquare } from './ProjectSquare'

const CARD = 'flex min-w-0 flex-col gap-3 rounded-card border border-line bg-panel p-3.5'

/** Without a module to order them, the server's order. */
const useServerOrder = () => () => 0

/**
 * THE PROJECTS OVERVIEW (FR-051, artboard 18): which projects moved and which went quiet, a card
 * each in the order the module that knows says, then the inbox, then the archived ones' count.
 */
export function Projects() {
  const projects = useProjects()
  const archived = useQuery(archivedProjectsQuery())
  const { projectCard: Card } = useRegistry()
  const order = (Card?.useOrder ?? useServerOrder)()

  const live = projects.data ?? []
  const inbox = live.find((p) => p.isInbox)
  // A stable sort: projects the order cannot tell apart keep the server's order.
  const others = live.filter((p) => !p.isInbox).sort(order)
  const set = archived.data?.length ?? 0

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <PageHead>Projects</PageHead>
        </div>
        <Link to="/projects/new" className={BUTTON.secondary}>
          <NewIcon size={16} aria-hidden="true" />
          New project
        </Link>
      </div>
      {projects.isError && (
        <p role="alert" className="text-ui text-stop-t">
          Couldn't load projects
        </p>
      )}
      <ul
        aria-label="Projects"
        className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))] gap-3"
      >
        {others.map((p) => (
          <ProjectCard key={p.id} project={p} />
        ))}
        {inbox && <InboxCard inbox={inbox} />}
      </ul>
      {set > 0 && (
        <button
          type="button"
          onClick={() => showArchived(true)}
          className="inline-flex items-center gap-1.5 self-start rounded-control text-meta text-muted hover:text-ink max-lg:tap"
        >
          <ArchiveIcon size={14} aria-hidden="true" />
          {set} archived project{set === 1 ? '' : 's'}
        </button>
      )}
    </div>
  )
}

/** One project: its square and name, when it last moved, and what its module says of it. */
function ProjectCard({ project }: { project: ProjectResponse }) {
  const { projectCard: Card } = useRegistry()
  return (
    <li data-project-card={project.id} className={`relative ${CARD} hover:border-line-strong`}>
      <div className="flex min-w-0 items-center gap-2.5">
        <ProjectSquare project={project} size={28} />
        <Link
          to={`/projects/${project.id}`}
          className="min-w-0 flex-1 truncate text-ui font-medium text-ink after:absolute after:inset-0 after:content-['']"
        >
          {project.name}
        </Link>
        {Card && <Card.Moved project={project} />}
      </div>
      {Card && <Card.Facts project={project} />}
    </li>
  )
}

/**
 * The inbox, a card of its own (FR-051): how much waits to be given a project, and the way there.
 * Empty, it is one line.
 */
function InboxCard({ inbox }: { inbox: ProjectResponse }) {
  const { projectCount } = useRegistry()
  const waiting = projectCount?.(inbox) ?? 0
  const name = (
    <Link to={`/projects/${inbox.id}`} className="after:absolute after:inset-0 after:content-['']">
      Inbox
    </Link>
  )
  if (waiting === 0)
    return (
      <li data-project-card={inbox.id} className={`relative ${CARD} self-start`}>
        <div className="flex items-center gap-2.5">
          <ProjectSquare project={inbox} size={28} />
          <span className="text-ui text-muted">{name} is empty</span>
        </div>
      </li>
    )
  return (
    <li data-project-card={inbox.id} className={`relative ${CARD} hover:border-line-strong`}>
      <div className="flex min-w-0 items-center gap-2.5">
        <ProjectSquare project={inbox} size={28} />
        <span className="flex-1 text-ui font-medium text-ink">{name}</span>
        <span className="shrink-0 text-meta text-subtle tabular-nums">{waiting} to sort</span>
      </div>
      <p className="text-ui text-muted">Captured lines that have not been given a project yet.</p>
      {/* Above the card's own link, which covers the rest of it. */}
      <Link
        to={`/projects/${inbox.id}`}
        className="relative inline-flex h-6.5 items-center self-start rounded-control border border-line-strong bg-panel px-2.25 text-meta font-medium text-ink hover:bg-hover max-lg:tap"
      >
        Sort the inbox
      </Link>
    </li>
  )
}
