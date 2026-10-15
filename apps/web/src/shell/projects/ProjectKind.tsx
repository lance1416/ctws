import { useQuery } from '@tanstack/react-query'
import { archivedProjectsQuery, useProjects } from './api'

/** Things' count for projects: the lines of work still running. */
export function ProjectsCount() {
  const projects = useProjects()
  if (!projects.data) return null
  return <span data-count>{projects.data.length} active</span>
}

/**
 * How many have been put away, when any have. Its own request: the list above holds only the live
 * ones, so counting the archived there always said none.
 */
export function ProjectsStatus() {
  const archived = useQuery(archivedProjectsQuery())
  const n = archived.data?.length ?? 0
  return n > 0 ? <span data-status>{n} archived</span> : null
}
