import type { QueryClient } from '@tanstack/react-query'

export const tasksKey = (projectId: string) => ['tasks', projectId]

/**
 * Makes a project's task list refetch after something changed it on the server.
 *
 * A bare `invalidateQueries` is not enough on the FIRST load. TanStack Query only honours
 * `cancelRefetch` when the query already has data (`query.fetch` checks `state.data !== undefined`);
 * with no data yet, an in-flight fetch is reused instead of restarted. A task created while that
 * first fetch is still running would then be answered by the pre-create response and nothing would
 * refetch: the task is in the database and absent from the screen. Cancelling first drops the
 * stale in-flight fetch, so the invalidation that follows starts a new request.
 */
export async function refreshTasks(qc: QueryClient, projectId: string): Promise<void> {
  await qc.cancelQueries({ queryKey: tasksKey(projectId) })
  await qc.invalidateQueries({ queryKey: tasksKey(projectId) })
}
