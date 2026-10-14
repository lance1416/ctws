import { useQuery } from '@tanstack/react-query'
import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { listMovement } from '../../modules/tasks/api/movement'
import { listProjects } from '../projects/api'
import { shortDay, todayIn } from '../../platform/time/dates'
import { movedLine } from '../../modules/tasks/movement'
import { ProjectRail } from '../rows/RowParts'
import { useTimeZone } from '../auth/useMe'
import { Panel, PanelEmpty } from '../../platform/ui/Panel'
import { useRegistry } from '../registry'
import { useCrumbs } from '../layout/Breadcrumbs'
import { useGround } from '../layout/ground'
import { useNow } from '../../platform/time/useNow'

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
  // The one page that is a desk: its cards are tiles of paper on it.
  useGround('desk')
  const heading = useRef<HTMLHeadingElement>(null)
  const widgets = useRegistry().widgets

  return (
    <div className="mx-auto w-full max-w-[73.75rem]">
      {/* The location in the header already names this page; the heading is for a screen reader's
          list of headings, and the cards are what the eye lands on. */}
      <h1 ref={heading} tabIndex={-1} className="sr-only">
        Workbench
      </h1>

      {/* TWELVE COLUMNS from 1024 up, each card as wide as its shape wants -- three counts and a
          list of rows are not the same width -- and one column below. The modules' cards in their
          stated order; the shell's Projects across the bottom, because Projects is the thing you go
          INTO and the rest is what is already in front of you. `items-start`, and a card stretches
          only to its row: a short card does not hang a pane of empty paper under itself. */}
      <div className="grid min-w-0 grid-cols-1 items-start gap-4 pt-2 lg:grid-cols-12">
        {widgets.map(({ moduleId, id, label, to, Component, Aside, span }) => (
          <Panel
            key={`${moduleId}:${id}`}
            variant="tile"
            label={label}
            to={to}
            action={Aside ? <Aside /> : undefined}
            className={`lg:self-stretch ${SPAN[span ?? 6]}`}
          >
            <Component />
          </Panel>
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
  12: 'lg:col-span-12',
} as const

/**
 * The shell's own card: the lines of work, and how much is open on each.
 *
 * Projects are the shell's dimension, so this one is not contributed -- it would survive every
 * module being removed.
 */
function ProjectsWidget() {
  const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects })
  // The same entry Today's This week reads: what each line did and when it last moved.
  const movement = useQuery({ queryKey: ['movement'], queryFn: listMovement })
  const today = todayIn(useTimeZone(), useNow())
  const rows = (projects.data ?? []).filter((p) => !p.archivedAt)
  const moved = new Map((movement.data ?? []).map((m) => [m.projectId, m]))

  return (
    <Panel variant="tile" label="Projects" to="/projects" className="lg:col-span-12">
      {projects.isError && (
        <p role="alert" className="px-2 py-1.5 text-sm text-danger">
          Couldn't load projects
        </p>
      )}
      {projects.isSuccess && rows.length === 0 && <PanelEmpty>No projects yet</PanelEmpty>}
      {/* EVERY LINE OF WORK AT ONCE, none louder than the rest: six equal columns of the same
          four lines -- what is open, what is late or due next, when it moved. */}
      <ul className="grid grid-cols-2 gap-x-6 gap-y-5 px-2 pb-1 sm:grid-cols-3 lg:grid-cols-6">
        {rows.map((p) => {
          const m = moved.get(p.id)
          return (
            <li key={p.id} className="min-w-0">
              <Link
                to={`/projects/${p.id}`}
                className="flex min-w-0 items-stretch gap-3 pt-0.5 pr-1 pb-1 hover:bg-hover"
              >
                <ProjectRail projectId={p.id} />
                <span className="flex min-w-0 flex-col text-sm">
                  <span className="truncate text-base font-semibold text-ink">{p.name}</span>
                  <span className="text-ink-muted tabular-nums">{p.openTasks} open</span>
                  {m && m.overdue > 0 ? (
                    <span className="text-missed">{m.overdue} overdue</span>
                  ) : m?.nextDueOn ? (
                    <span className="text-deadline">Due {shortDay(m.nextDueOn, today)}</span>
                  ) : null}
                  {m && <span className="text-ink-subtle">{movedLine(m, today)}</span>}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}
