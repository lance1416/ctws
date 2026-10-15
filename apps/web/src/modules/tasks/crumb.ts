/** Where a task lives, in words: its project, then its parent if it has one. */
export const taskCrumb = (t: { projectName: string; parentTitle: string | null }) =>
  t.parentTitle === null ? t.projectName : `${t.projectName} › ${t.parentTitle}`

/** The task's project page, scrolled and unfolded to show it (`TaskTree` reads `?reveal=`). */
export const revealHref = (projectId: string, taskId: string) =>
  `/projects/${projectId}?reveal=${taskId}`
