import { OPEN_TASKS_COLUMN, PARENT_TASKS_COLUMN, type ProjectResponse } from '@ctws/contracts'

/** A project's open tasks, as the server counted them for the list. */
export const openTasksOf = (project: ProjectResponse): number =>
  project.columns[OPEN_TASKS_COLUMN] ?? 0

/** Whether a project has a task with one under it, as the server counted: Move to…'s "›". */
export const hasParentTasks = (project: ProjectResponse | undefined): boolean =>
  (project?.columns[PARENT_TASKS_COLUMN] ?? 0) > 0
