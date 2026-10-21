import { Link } from 'react-router-dom'
import { useProjects } from '../projects/api'
import { ProjectRail } from '../rows/RowParts'
import { PanelEmpty, Tile } from '../../platform/ui/Panel'
import { useRegistry } from '../registry'

/**
 * The shell's front page: a fixed arrangement of the cards modules contribute, for the things that
 * belong to no project.
 */
export function Workbench() {
  const widgets = useRegistry().widgets

  return (
    <div className="mx-auto w-full max-w-[73.75rem]">
      {/* The header already names this page; the heading is for a screen reader's list. */}
      <h1 tabIndex={-1} className="sr-only">
        Workbench
      </h1>

      {/* Twelve columns from 1024 up, one below; the shell's Projects card goes last. */}
      <div className="grid min-w-0 grid-cols-1 items-start gap-4 pt-2 lg:grid-cols-12">
        {widgets.map(({ moduleId, id, label, to, Component, Aside, span }) => (
          <Tile
            key={`${moduleId}:${id}`}
            label={label}
            to={to}
            action={Aside ? <Aside /> : undefined}
            className={`lg:self-stretch ${SPAN[span]}`}
          >
            <Component />
          </Tile>
        ))}
        <ProjectsWidget />
      </div>
    </div>
  )
}

/** Tailwind sees whole class names only: one literal per width a card can ask for. */
const SPAN = {
  4: 'lg:col-span-4',
  6: 'lg:col-span-6',
  8: 'lg:col-span-8',
} as const

/** The shell's own card, not contributed by a module: every project and its numbers. */
function ProjectsWidget() {
  const projects = useProjects()
  const facts = useRegistry().projectTileFacts
  const rows = projects.data ?? []

  return (
    <Tile label="Projects" to="/projects" className="lg:col-span-12">
      {projects.isError && (
        <p role="alert" className="px-2 py-1.5 text-ui text-stop-t">
          Couldn't load projects
        </p>
      )}
      {projects.isSuccess && rows.length === 0 && <PanelEmpty>No projects yet</PanelEmpty>}
      <ul className="grid grid-cols-2 gap-x-6 gap-y-5 px-2 pb-1 sm:grid-cols-3 lg:grid-cols-6">
        {rows.map((p) => (
          <li key={p.id} className="min-w-0">
            <Link
              to={`/projects/${p.id}`}
              className="flex min-w-0 items-stretch gap-3 pt-0.5 pr-1 pb-1 hover:bg-hover"
            >
              <ProjectRail projectId={p.id} />
              <span className="flex min-w-0 flex-col text-ui">
                <span className="truncate text-prose font-medium text-ink">{p.name}</span>
                {facts.map(({ moduleId, Facts }) => (
                  <Facts key={moduleId} project={p} />
                ))}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Tile>
  )
}
