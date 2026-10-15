import { useQuery } from '@tanstack/react-query'
import { archivedProjectsQuery, useProjects } from './api'

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
