import { OPEN_TASKS_COLUMN, type ProjectResponse } from '@ctws/contracts'

/** A project's open tasks, as the server counted them for the list. */
export const openTasksOf = (project: ProjectResponse): number =>
  project.columns[OPEN_TASKS_COLUMN] ?? 0
