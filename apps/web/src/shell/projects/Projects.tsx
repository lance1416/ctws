import type { ProjectListItem, ProjectMovementResponse } from '@ctws/contracts'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError } from '../../platform/http/api'
import { listMovement } from '../../modules/tasks/api/movement'
import { getTask } from '../../modules/tasks/api/tasks'
import {
  archivedProjectsKey,
  createProject,
  listArchivedProjects,
  listProjects,
} from './api'
import { todayIn } from '../../platform/time/dates'
import { movedLine } from '../../modules/tasks/movement'
import { deadlineDayLead, LIST_MEASURE } from '../rows/leads'
import { useComposing } from '../../platform/keyboard/composition'
import { DaySection } from '../rows/DaySection'
import { textbox } from '../../platform/ui/formStyles'
import { useCrumbs } from '../layout/Location'
import { RowLead } from '../rows/RowLead'
import { BODY_GUTTER, ProjectRail, ROW_LIST } from '../rows/RowParts'
import { useTimeZone } from '../auth/useMe'
import { useNow } from '../../platform/time/useNow'

export function Projects() {
  useCrumbs([{ label: 'Projects' }])
  const composing = useComposing()
  const [name, setName] = useState('')
  const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects })
  // The same entry Today's This week and the Workbench read: what is late, what is next, when
  // each line of work last moved. Archived projects are not in it, on purpose.
  const movement = useQuery({ queryKey: ['movement'], queryFn: listMovement })
  const archivedList = useQuery({ queryKey: archivedProjectsKey, queryFn: listArchivedProjects })
  const today = todayIn(useTimeZone(), useNow())
  /**
   * `/projects?task=<id>` is where a link to a task goes when all it knows is the task (a person's
   * Linked, a pasted address): ask which project the task lives in and go there, sheet open. In
   * place of this step in the history, so Back returns to wherever the link was.
   */
  const [params] = useSearchParams()
  const linkedTask = params.get('task')
  const navigate = useNavigate()
  const found = useQuery({
    queryKey: ['task', linkedTask],
    queryFn: () => getTask(linkedTask!),
    enabled: linkedTask !== null,
    retry: false,
  })
  useEffect(() => {
    if (found.data)
      navigate(`/projects/${found.data.projectId}?task=${found.data.id}`, { replace: true })
  }, [found.data, navigate])

  const create = useMutation({
    mutationFn: createProject,
    meta: { awaits: [['projects']] },
    onSuccess: () => setName(''),
  })
  const heading = useRef<HTMLHeadingElement>(null)

  const submit = () => {
    const n = name.trim()
    if (n && !create.isPending) create.mutate({ name: n })
  }

  const moved = new Map((movement.data ?? []).map((m) => [m.projectId, m]))
  // Rendered in the order the server returns: it puts the inbox first. Sorting here too would
  // give two sorts that drift apart. The server lists only the live ones; the shelf asks for its
  // own (`listArchivedProjects`).
  const active = projects.data ?? []
  const archived = archivedList.data ?? []

  return (
    <>
      {/* On the margin's edge, where the rows' threads hang: the page is one column of rows. */}
      <h1
        ref={heading}
        tabIndex={-1}
        className="ml-15 text-2xl font-semibold tracking-[-0.02em] focus:outline-none sm:ml-18"
      >
        Projects
      </h1>
      <div className="mt-5 ml-15 max-w-[40ch] sm:ml-18">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          {...composing.bind}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !composing.composingNow(e)) submit()
          }}
          placeholder="New project"
          aria-label="New project"
          className={`w-full bg-sheet ${textbox}`}
        />
      </div>
      {/* Gone is what the server SAYS (404); anything else is a failure to ask, and saying the
          task is gone then would send someone looking for a task that is still there. */}
      {linkedTask && found.isError && (
        <p role="alert" className="mt-4 ml-15 text-sm text-ink-muted sm:ml-18">
          {found.error instanceof ApiError && found.error.status === 404
            ? 'This task is not here any more.'
            : "Couldn't open this task. Check that the server is running."}
        </p>
      )}
      {projects.isError && (
        <p role="alert" className="mt-4 ml-15 text-sm text-danger sm:ml-18">
          Couldn't load projects
        </p>
      )}
      {create.isError && (
        <p role="alert" className="mt-4 ml-15 text-sm text-danger sm:ml-18">
          That didn't work. Try again.
        </p>
      )}

      <section aria-label="Active" className={`mt-6 ${LIST_MEASURE}`}>
        <ul className={ROW_LIST}>
          {active.map((p) => (
            <ProjectRow key={p.id} project={p} moved={moved.get(p.id)} today={today} />
          ))}
        </ul>
      </section>

      {/* SET ASIDE, NOT GONE: an archived line of work is still here, under its own heading, so
          the live ones are the list and the shelf is one look further down. */}
      {archived.length > 0 && (
        <DaySection label="Archived" count={archived.length} className={`mt-8 ${LIST_MEASURE}`}>
          <ul className={ROW_LIST}>
            {archived.map((p) => (
              <ProjectRow key={p.id} project={p} moved={undefined} today={today} />
            ))}
          </ul>
        </DaySection>
      )}
    </>
  )
}

/**
 * ONE LINE OF WORK, on the app's row: its next standing deadline in the margin, its colour as the
 * thread, and the body -- its name, then what is open, what is late and when it last moved.
 *
 * THE NAME IS THE LINK, AND ONLY THE NAME: the row is the target (the link is stretched over it),
 * but the link's name is the project's, so "P" is still the name of the link to P. NO DELETE IN
 * THE ROW: that lives at the foot of the project's own page, with every other action that cannot
 * be undone.
 */
function ProjectRow({
  project: p,
  moved: m,
  today,
}: {
  project: ProjectListItem
  moved: ProjectMovementResponse | undefined
  today: string
}) {
  const said: ReactNode[] = [
    // The server's own count of open tasks, never counted on this side.
    <span key="open" data-count>
      {p.openTasks} open
    </span>,
  ]
  // "0 overdue" is not news; the one number allowed the miss colour, when there is one.
  if (m && m.overdue > 0)
    said.push(
      <span key="late" className="text-missed">
        {m.overdue} overdue
      </span>,
    )
  if (m) said.push(<span key="moved">{movedLine(m, today)}</span>)
  return (
    <li data-project-row={p.id} className="group relative flex min-h-14 min-w-0">
      <RowLead lead={m?.nextDueOn ? deadlineDayLead(m.nextDueOn, today) : null} />
      <ProjectRail projectId={p.id} />
      <div
        className={`flex min-w-0 flex-1 flex-col py-2.5 pr-2 pl-[var(--gutter)] group-hover:bg-hover ${BODY_GUTTER}`}
      >
        <Link
          to={`/projects/${p.id}`}
          className="truncate text-ink after:absolute after:inset-0 after:content-['']"
        >
          {p.name}
        </Link>
        <span data-project-meta className="truncate text-sm text-ink-muted tabular-nums">
          {said.map((part, i) => (
            <Fragment key={i}>
              {i > 0 && <span aria-hidden="true"> · </span>}
              {part}
            </Fragment>
          ))}
        </span>
      </div>
    </li>
  )
}
