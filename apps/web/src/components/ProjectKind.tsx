import { useQuery } from '@tanstack/react-query'
import { listProjects } from '../api/projects'

/** Things' count for projects: the lines of work still running. */
export function ProjectsCount() {
  const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects })
  if (!projects.data) return null
  return <span data-count>{projects.data.filter((p) => !p.archivedAt).length} active</span>
}

/** How many have been put away, when any have. */
export function ProjectsStatus() {
  const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects })
  const archived = projects.data?.filter((p) => p.archivedAt).length ?? 0
  return archived > 0 ? <span data-status>{archived} archived</span> : null
}
