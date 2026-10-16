import {
  api,
  type ProjectColor,
  type ProjectListItem,
  type ProjectResponse,
  type ProjectId,
} from '@ctws/contracts'
import { queryOptions, useQuery, type UseQueryResult } from '@tanstack/react-query'
import { call, everyPage } from '../../platform/http/api'

/** The live projects, with the server's own `openTasks` counts. */
async function listProjects(): Promise<ProjectListItem[]> {
  const pages = await everyPage((cursor) => call(api.projects.list, { query: { cursor } }))
  return pages.flatMap((p) => p.projects)
}

/** The archived projects: the server leaves them out of the list above unless asked. */
async function listArchivedProjects(): Promise<ProjectListItem[]> {
  const pages = await everyPage((cursor) =>
    call(api.projects.list, { query: { archived: 'true', cursor } }),
  )
  return pages.flatMap((p) => p.projects)
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
  return call(api.projects.create, { body })
}

export function deleteProject(id: ProjectId): Promise<void> {
  return call(api.projects.remove, { params: { id } })
}

/** The quick-capture destination, found by the `isInbox` flag: the user may rename it. */
export function inboxOf<T extends ProjectResponse>(projects: T[]): T | undefined {
  return projects.find((p) => p.isInbox)
}

/** Renames, recolours, archives or unarchives a project; the inbox cannot be archived. */
export function updateProject(
  id: ProjectId,
  body: { name?: string; color?: ProjectColor; archived?: boolean },
): Promise<ProjectResponse> {
  return call(api.projects.update, { params: { id }, body })
}
