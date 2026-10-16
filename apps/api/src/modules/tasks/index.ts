import { OPEN_TASKS_COLUMN } from '@ctws/contracts'
import type { ApiModule } from '../../shell/module'
import { taskLinkable } from './linkable'
import { openTaskCountSql } from './queries/scope'
import { taskRoutes } from './routes'

export const tasksModule: ApiModule = {
  id: 'tasks',
  routes: taskRoutes,
  linkable: taskLinkable,
  projectColumns: { [OPEN_TASKS_COLUMN]: openTaskCountSql() },
}
