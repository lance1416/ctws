import type { QueryClient, QueryKey } from '@tanstack/react-query'

export const tasksKey = (projectId: string) => ['tasks', projectId]
export const projectsKey = ['projects']

/**
 * Makes a list refetch after something changed it on the server.
 *
 * A bare `invalidateQueries` is not enough on the FIRST load. TanStack Query only honours
 * `cancelRefetch` when the query already has data (`query.fetch` checks `state.data !== undefined`,
 * whatever the key); with no data yet, an in-flight fetch is reused instead of restarted. A row
 * created while that first fetch is still running would then be answered by the pre-create
 * response and nothing would refetch: the row is in the database and absent from the screen.
 * Cancelling first drops the stale in-flight fetch, so the invalidation that follows starts a new
 * request. Every list whose creator can race its own first load goes through here.
 */
async function refreshList(qc: QueryClient, queryKey: QueryKey): Promise<void> {
  await qc.cancelQueries({ queryKey })
  await qc.invalidateQueries({ queryKey })
}

export const refreshTasks = (qc: QueryClient, projectId: string) =>
  refreshList(qc, tasksKey(projectId))

export const refreshProjects = (qc: QueryClient) => refreshList(qc, projectsKey)
