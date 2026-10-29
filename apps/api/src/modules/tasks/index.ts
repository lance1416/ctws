import { OPEN_TASKS_COLUMN, PARENT_TASKS_COLUMN } from '@ctws/contracts'
import { fixedModule } from '../../shell/module'
import { taskLinkable } from './linkable'
import { openTaskCountSql, parentTaskCountSql } from './queries'
import { taskRoutes } from './routes'
import { projectGraves } from './service'

export const tasksModule = fixedModule({
  id: 'tasks',
  routes: taskRoutes,
  linkable: taskLinkable,
  projectColumns: {
    [OPEN_TASKS_COLUMN]: openTaskCountSql(),
    [PARENT_TASKS_COLUMN]: parentTaskCountSql(),
  },
  projectGraves,
})
