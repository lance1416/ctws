import { api, type ProjectColor, type ProjectResponse, type ProjectId } from '@ctws/contracts'
import { queryOptions, useQuery, type UseQueryResult } from '@tanstack/react-query'
import { call, everyPage } from '../../platform/http/api'

/** Live or archived projects, with the counts the server's modules add to each. */
async function listProjects(archived: boolean, signal: AbortSignal): Promise<ProjectResponse[]> {
  const pages = await everyPage(
    (cursor) =>
      call(
        api.projects.list,
        { query: { ...(archived ? { archived: 'true' } : {}), cursor } },
        { signal },
      ),
    signal,
  )
  return pages.flatMap((p) => p.projects)
}

/**
 * The shell's project keys. The live list's key is the prefix of every other, so `all` reaches the
 * archived shelf too.
 */
export const projectKeys = {
  all: ['projects'] as const,
  archived: ['projects', 'archived'] as const,
}

export const projectsQuery = () =>
  queryOptions({ queryKey: projectKeys.all, queryFn: ({ signal }) => listProjects(false, signal) })
/** The archived projects: the server leaves them out of the list above unless asked. */
export const archivedProjectsQuery = () =>
  queryOptions({
    queryKey: projectKeys.archived,
    queryFn: ({ signal }) => listProjects(true, signal),
  })

export const useProjects = (): UseQueryResult<ProjectResponse[]> => useQuery(projectsQuery())

/**
 * Live and archived together: an archived project still has its page and its colour. A shelf that
 * failed to load leaves the live ones; `isSuccess` waits for both, as only then is a project that
 * is in neither known to be gone.
 */
export function useEveryProject(): { data: ProjectResponse[] | undefined; isSuccess: boolean } {
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
export function inboxOf(projects: ProjectResponse[]): ProjectResponse | undefined {
  return projects.find((p) => p.isInbox)
}

/** Renames, recolours, archives or unarchives a project; the inbox cannot be archived. */
export function updateProject(
  id: ProjectId,
  body: { name?: string; color?: ProjectColor; archived?: boolean },
): Promise<ProjectResponse> {
  return call(api.projects.update, { params: { id }, body })
}
