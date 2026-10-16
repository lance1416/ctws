import type { ProjectColor, ProjectListItem, ProjectResponse } from '@ctws/contracts'
import { queryOptions, useQuery, type UseQueryResult } from '@tanstack/react-query'
import { apiFetch } from '../../platform/http/api'

/** The live projects, with the server's own `openTasks` counts. */
async function listProjects(): Promise<ProjectListItem[]> {
  return (await apiFetch<{ projects: ProjectListItem[] }>('/projects')).projects
}

/** The archived projects: the server leaves them out of the list above unless asked. */
async function listArchivedProjects(): Promise<ProjectListItem[]> {
  return (await apiFetch<{ projects: ProjectListItem[] }>('/projects?archived=true')).projects
}

export const projectsQuery = () => queryOptions({ queryKey: ['projects'], queryFn: listProjects })
export const archivedProjectsQuery = () =>
  queryOptions({ queryKey: ['projects', 'archived'], queryFn: listArchivedProjects })

export const useProjects = (): UseQueryResult<ProjectListItem[]> => useQuery(projectsQuery())

/**
 * Live and archived together: an archived project still has its page and its colour. A shelf that
 * failed to load leaves the live ones; `isSuccess` waits for both, as only then is a project that
 * is in neither known to be gone.
 */
export function useEveryProject(): { data: ProjectListItem[] | undefined; isSuccess: boolean } {
  const live = useProjects()
  const shelf = useQuery(archivedProjectsQuery())
  return {
    data: live.data ? [...live.data, ...(shelf.data ?? [])] : undefined,
    isSuccess: live.isSuccess && shelf.isSuccess,
  }
}

export function createProject(body: { name: string }): Promise<ProjectResponse> {
  return apiFetch<ProjectResponse>('/projects', { method: 'POST', body: JSON.stringify(body) })
}

export function deleteProject(id: string): Promise<void> {
  return apiFetch<void>(`/projects/${id}`, { method: 'DELETE' })
}

/** The quick-capture destination, found by the `isInbox` flag: the user may rename it. */
export function inboxOf<T extends ProjectResponse>(projects: T[]): T | undefined {
  return projects.find((p) => p.isInbox)
}

/** Renames, recolours, archives or unarchives a project; the inbox cannot be archived. */
export function updateProject(
  id: string,
  body: { name?: string; color?: ProjectColor; archived?: boolean },
): Promise<ProjectResponse> {
  return apiFetch<ProjectResponse>(`/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}
