import { api } from '@ctws/contracts'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { on, serve } from '../../platform/http/serve'
import { actorOf, currentUser } from '../auth/authenticated'
import type { ProjectColumns } from '../module'
import { toProjectListItem, toProjectResponse } from './mapper'
import { getProjectRow, listProjects } from './queries'
import { createProject, softDeleteProject, updateProject } from './service'

/** Projects belong to the shell; modules add columns to the list but do not own them. */
export const projectRoutes: FastifyPluginAsyncZod<{ columns: ProjectColumns }> = async (
  app,
  { columns },
) => {
  serve(app, [
    on(api.projects.list, async (req) => {
      const { rows, page } = await listProjects(
        app.db,
        currentUser(req).workspaceId,
        { archived: req.query.archived === 'true' },
        columns,
        req.query,
      )
      return { projects: rows.map(toProjectListItem), page }
    }),

    on(api.projects.get, async (req) =>
      toProjectListItem(
        await getProjectRow(app.db, currentUser(req).workspaceId, req.params.id, columns),
      ),
    ),

    on(api.projects.create, async (req) =>
      toProjectResponse(await createProject(app.db, actorOf(req), req.body)),
    ),

    on(api.projects.update, async (req) =>
      toProjectResponse(await updateProject(app.db, actorOf(req), req.params.id, req.body)),
    ),

    on(api.projects.remove, async (req) => {
      await softDeleteProject(app.db, actorOf(req), req.params.id)
    }),
  ])
}
