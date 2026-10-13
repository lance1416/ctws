import { sql } from 'drizzle-orm'
import type { ApiModule } from '../../shell/module'
import { taskLinkable } from './linkable'
import { taskRoutes } from './routes'

export const tasksModule: ApiModule = {
  id: 'tasks',
  routes: taskRoutes,
  linkable: taskLinkable,
  projectColumns: {
    // Correlated through the literal `projects.id`: a drizzle column would render unqualified.
    openTasks: sql<number>`(
      select count(*) from tasks open_t
      where open_t.project_id = projects.id
        and open_t.deleted_at is null
        and open_t.status not in ('done', 'cancelled')
    )`.mapWith(Number),
  },
}
