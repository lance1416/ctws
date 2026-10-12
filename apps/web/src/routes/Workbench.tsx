import { useQuery } from '@tanstack/react-query'
import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { listProjects } from '../api/projects'
import { Panel, PanelEmpty } from '../components/Panel'
import { useProjectRail } from '../projectColor'
import { moduleWidgets } from '../modules/registry'
import { useCrumbs } from '../components/Location'

/**
 * THE WORKBENCH -- THE SHELL'S OWN FRONT PAGE, and the first surface that is nobody's module.
 *
 * It answers one question: what is in front of me. Every card on it is a glance contributed by a
 * module, and what the cards deliberately leave out is anything that already has a home on a
 * project page -- the workbench is where the things belonging to no line of work live.
 *
 * The arrangement is FIXED. No drag, no resize, no way to add a panel: one person has one taste,
 * and a free grid only moves the design decision onto the person using the tool. If a card is in
 * the wrong place, that is a decision to make here, in the code, once.
 */
export function Workbench() {
  useCrumbs([{ label: 'Workbench' }])
  const heading = useRef<HTMLHeadingElement>(null)
  const widgets = moduleWidgets()

  return (
    <>
      <h1 ref={heading} tabIndex={-1} className="text-xl font-semibold focus:outline-none">
        Workbench
      </h1>

      {/* Two columns where there is room for two, one where there is not. The modules' cards come
          first and in registration order; the shell's own card sits under them, because Projects is
          the thing you go INTO and the rest is what is already in front of you. */}
      {/* `items-start`: each card is as tall as what is in it. Stretching them to match the
          tallest leaves the shorter one with a pane of empty paper under it, which reads as
          something failing to load. */}
      <div className="mt-4 grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {widgets.map(({ moduleId, id, label, to, Component }) => (
          <Panel
            key={`${moduleId}:${id}`}
            label={label}
            action={to ? <SeeAll to={to} /> : undefined}
          >
            <Component />
          </Panel>
        ))}
      </div>

      <div className="mt-4 min-w-0">
        <ProjectsWidget />
      </div>
    </>
  )
}

function SeeAll({ to }: { to: string }) {
  return (
    <Link to={to} className="rounded-lg text-sm text-ink-muted hover:text-ink">
      See all
    </Link>
  )
}

/**
 * The shell's own card: the lines of work, and how much is open on each.
 *
 * Projects are the shell's dimension, so this one is not contributed -- it would survive every
 * module being removed.
 */
function ProjectsWidget() {
  const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects })
  const rail = useProjectRail()
  const rows = (projects.data ?? []).filter((p) => !p.archivedAt)

  return (
    <Panel label="Projects" action={<SeeAll to="/projects" />}>
      {projects.isError && (
        <p role="alert" className="px-2 py-1.5 text-sm text-danger">
          Couldn't load projects
        </p>
      )}
      {projects.isSuccess && rows.length === 0 && <PanelEmpty>No projects yet</PanelEmpty>}
      <ul className="flex flex-wrap gap-x-5 gap-y-1 px-2">
        {rows.map((p) => (
          <li key={p.id} className="flex min-w-0 items-center gap-1.5">
            {/* The identity chip, inline rather than the rows' absolute rail: this is a chip
                beside a name, not the left edge of a row. Never alone -- the name is right there
                (WCAG 1.4.1). */}
            <span
              aria-hidden="true"
              className={`h-3.5 w-[3px] shrink-0 rounded-full ${rail(p.id)}`}
            />
            <Link to={`/projects/${p.id}`} className="truncate text-sm text-ink hover:underline">
              {p.name}
            </Link>
            {p.openTasks > 0 && (
              <span className="text-xs text-ink-subtle tabular-nums">{p.openTasks}</span>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  )
}
