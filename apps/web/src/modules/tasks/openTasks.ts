import { OPEN_TASKS_COLUMN, type ProjectListItem } from '@ctws/contracts'

/** A project's open tasks, as the server counted them for the list. */
export const openTasksOf = (project: ProjectListItem): number =>
  project.columns[OPEN_TASKS_COLUMN] ?? 0
