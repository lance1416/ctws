import type { QueryClient, QueryKey } from '@tanstack/react-query'

export const tasksKey = (projectId: string) => ['tasks', projectId]
const projectsKey = ['projects']
/** Movement's numbers. Any task that is created, finished or deleted moves one of them. */
const movementKey = ['movement']

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
export async function refreshList(qc: QueryClient, queryKey: QueryKey): Promise<void> {
  await qc.cancelQueries({ queryKey })
  await qc.invalidateQueries({ queryKey })
}

export const refreshTasks = async (qc: QueryClient, projectId: string): Promise<void> => {
  await refreshList(qc, tasksKey(projectId))
  // A new row changes how many are open and the project's last activity, so the movement numbers
  // are stale the moment a task is created -- in the Movement panel and in the project banner. It
  // is invalidated here rather than at each call site, because every creation path already goes
  // through this one function.
  //
  // DELIBERATELY NOT AWAITED. The caller keeps its input busy until this resolves, and the typist
  // is waiting for the ROW, not for a count beside the project's name. Since the banner mounted
  // this query on the project page, awaiting it put a second round trip between one Enter and the
  // next, and a key pressed in that window is dropped: adding tasks in a row started losing
  // every other one under load. The refetch still starts immediately; nothing waits for it.
  void qc.invalidateQueries({ queryKey: movementKey }).catch(() => {})
}

export const refreshProjects = (qc: QueryClient) => refreshList(qc, projectsKey)
