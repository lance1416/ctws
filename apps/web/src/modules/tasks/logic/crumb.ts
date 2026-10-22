import type { ProjectId, TaskId } from '@ctws/contracts'
/** Where a task lives, in words: its project, then its parent if it has one. */
export const taskCrumb = (t: { projectName: string; parentTitle: string | null }) =>
  t.parentTitle === null ? t.projectName : `${t.projectName} › ${t.parentTitle}`

/** The task's project page, scrolled and unfolded to show it (`TaskTree` reads `?reveal=`). */
export const revealHref = (projectId: ProjectId, taskId: TaskId) =>
  `/projects/${projectId}?reveal=${taskId}`

/** The task's project page with it shown, as `revealHref`, and open in the inspector. */
export const openHref = (projectId: ProjectId, taskId: TaskId) =>
  `/projects/${projectId}?${new URLSearchParams({ reveal: taskId, task: taskId })}`
