import type { LinkCandidate } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { archivedProjectsQuery, useEveryProject, useProjects } from './api'
import { ProjectSquare } from './ProjectSquare'

/** Things' count for projects: the lines of work still running. */
export function ProjectsCount() {
  const projects = useProjects()
  if (!projects.data) return null
  return <span data-count>{projects.data.length} active</span>
}

/** How many are archived, if any. Its own request: the live list leaves them out. */
export function ProjectsStatus() {
  const archived = useQuery(archivedProjectsQuery())
  const n = archived.data?.length ?? 0
  return n > 0 ? <span data-status>{n} archived</span> : null
}

/** What a phone's More says beside Projects (FR-085): the live ones, the inbox not among them. */
export function ProjectsMoreCount() {
  const projects = useProjects()
  if (!projects.data) return null
  return <span data-count>{projects.data.filter((p) => !p.isInbox).length}</span>
}

/** A project in a list of things (a picker, search): its own square, not the kind's folder. */
export function ProjectListMark({ thing }: { thing: LinkCandidate }) {
  const project = useEveryProject().data?.find((p) => p.id === thing.id)
  return project ? <ProjectSquare project={project} /> : null
}
