import { OPEN_TASKS_COLUMN, PARENT_TASKS_COLUMN, type TaskId } from '@ctws/contracts'
import { textSourceOf } from '../../shell/unlinked'
import { taskLog } from './log'
import { tasks } from './tables'
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
  texts: textSourceOf({
    type: 'task',
    table: tasks,
    id: tasks.id,
    workspace: tasks.workspaceId,
    text: tasks.notes,
    field: 'notes',
    deleted: tasks.deletedAt,
    updated: tasks.updatedAt,
    log: (tx, ctx, id, was, next) =>
      taskLog(tx, ctx).append(id as TaskId, 'notes_changed', { from: was, to: next }),
  }),
})
