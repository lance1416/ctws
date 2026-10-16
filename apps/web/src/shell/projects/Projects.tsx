import type { ProjectListItem } from '@ctws/contracts'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { archivedProjectsQuery, createProject, useProjects } from './api'
import { LIST_MEASURE } from '../rows/leads'
import { useLineEntry } from '../../platform/ui/useLineEntry'
import { DaySection } from '../rows/DaySection'
import { textbox } from '../../platform/ui/formStyles'
import { ProjectRail, ROW_BODY, ROW_LIST } from '../rows/RowParts'
import { PageHead } from '../../platform/ui/PageHead'
import { HANG } from '../../platform/ui/hang'
import { useRegistry } from '../registry'

export function Projects() {
  const name = useLineEntry()
  const projects = useProjects()
  const archivedList = useQuery(archivedProjectsQuery())

  const send = name.sends((text) => createProject({ name: text }))
  const create = useMutation({
    mutationFn: send,
    meta: { awaits: [['projects']], ownsError: true },
  })

  // In the server's order, which puts the inbox first; a second sort here would drift from it.
  const active = projects.data ?? []
  const archived = archivedList.data ?? []

  return (
    <>
      <PageHead hang>Projects</PageHead>
      <div className={`mt-5 ${HANG} max-w-[40ch]`}>
        <input
          {...name.field({ onSubmit: create.mutate, busy: create.isPending })}
          placeholder="New project"
          aria-label="New project"
          className={`w-full bg-sheet ${textbox}`}
        />
      </div>
      {projects.isError && (
        <p role="alert" className={`mt-4 ${HANG} text-sm text-danger`}>
          Couldn't load projects
        </p>
      )}
      {create.isError && (
        <p role="alert" className={`mt-4 ${HANG} text-sm text-danger`}>
          That didn't work. Try again.
        </p>
      )}

      <section aria-label="Active" className={`mt-6 ${LIST_MEASURE}`}>
        <ul className={ROW_LIST}>
          {active.map((p) => (
            <ProjectRow key={p.id} project={p} />
          ))}
        </ul>
      </section>

      {archived.length > 0 && (
        <DaySection label="Archived" count={archived.length} className={`mt-8 ${LIST_MEASURE}`}>
          <ul className={ROW_LIST}>
            {archived.map((p) => (
              <ProjectRow key={p.id} project={p} />
            ))}
          </ul>
        </DaySection>
      )}
    </>
  )
}

/**
 * One project on the app's row. The link is stretched over the whole row but named by the project
 * alone; delete lives on the project's own page.
 */
function ProjectRow({ project: p }: { project: ProjectListItem }) {
  const { projectLead: Lead, projectFacts } = useRegistry()
  return (
    <li data-project-row={p.id} className="group relative flex min-h-14 min-w-0">
      {Lead && <Lead projectId={p.id} />}
      <ProjectRail projectId={p.id} />
      <div className={`${ROW_BODY} flex-col py-2.5 pr-2 group-hover:bg-hover`}>
        <Link
          to={`/projects/${p.id}`}
          className="truncate text-ink after:absolute after:inset-0 after:content-['']"
        >
          {p.name}
        </Link>
        <span data-project-meta className="truncate text-sm text-ink-muted tabular-nums">
          {projectFacts.map(({ moduleId, Facts }) => (
            <Facts key={moduleId} project={p} place="row" />
          ))}
        </span>
      </div>
    </li>
  )
}
