import type { ProjectId, TaskId } from '@ctws/contracts'
/** The task's project page, scrolled and unfolded to show it (`TaskTree` reads `?reveal=`). */
export const revealHref = (projectId: ProjectId, taskId: TaskId) =>
  `/projects/${projectId}?reveal=${taskId}`

/** The task's project page with it shown, as `revealHref`, and open in the inspector. */
export const openHref = (projectId: ProjectId, taskId: TaskId) =>
  `/projects/${projectId}?${new URLSearchParams({ reveal: taskId, task: taskId })}`
