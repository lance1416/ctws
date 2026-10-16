import { api } from '@ctws/contracts'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { on, serve } from '../../platform/http/serve'
import { actorOf, currentUser } from '../auth/authenticated'
import type { ProjectColumns } from '../module'
import { toProjectResponse } from './mapper'
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
      return { projects: rows.map(toProjectResponse), page }
    }),

    on(api.projects.get, async (req) =>
      toProjectResponse(
        await getProjectRow(app.db, currentUser(req).workspaceId, req.params.id, columns),
      ),
    ),

    // A write answers with the project as every read gives it, its columns counted.
    on(api.projects.create, async (req) => {
      const made = await createProject(app.db, actorOf(req), req.body)
      return toProjectResponse(await getProjectRow(app.db, made.workspaceId, made.id, columns))
    }),

    on(api.projects.update, async (req) => {
      const changed = await updateProject(app.db, actorOf(req), req.params.id, req.body)
      return toProjectResponse(
        await getProjectRow(app.db, changed.workspaceId, changed.id, columns),
      )
    }),

    on(api.projects.remove, async (req) => {
      await softDeleteProject(app.db, actorOf(req), req.params.id)
    }),
  ])
}
