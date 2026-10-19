import { api } from '@ctws/contracts'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { on, serve } from '../../platform/http/serve'
import { actorOf, currentUser } from '../auth/authenticated'
import type { ProjectColumns } from '../module'
import { toProjectResponse } from './mapper'
import { getProjectRow, listProjects } from './queries'
import { createProject, softDeleteProject, updateProject } from './service'
import { listStages, putStages, stagesOf } from './stages'

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
      const stages = await stagesOf(
        app.db,
        currentUser(req).workspaceId,
        rows.map((r) => r.project.id),
      )
      return { projects: rows.map((r) => toProjectResponse(r, stages.get(r.project.id))), page }
    }),

    on(api.projects.get, async (req) => {
      const { workspaceId } = currentUser(req)
      const row = await getProjectRow(app.db, workspaceId, req.params.id, columns)
      return toProjectResponse(row, await listStages(app.db, workspaceId, row.project.id))
    }),

    // A write answers with the project as every read gives it, its columns counted.
    on(api.projects.create, async (req) => {
      const made = await createProject(app.db, actorOf(req), req.body)
      return toProjectResponse(await getProjectRow(app.db, made.workspaceId, made.id, columns))
    }),

    on(api.projects.update, async (req) => {
      const changed = await updateProject(app.db, actorOf(req), req.params.id, req.body)
      return toProjectResponse(
        await getProjectRow(app.db, changed.workspaceId, changed.id, columns),
        await listStages(app.db, changed.workspaceId, changed.id),
      )
    }),

    on(api.projects.putStages, async (req) => {
      const ctx = actorOf(req)
      const stages = await app.db.transaction(async (tx) => {
        await getProjectRow(tx, ctx.workspaceId, req.params.id, columns)
        return putStages(tx, ctx, req.params.id, req.body)
      })
      return { stages }
    }),

    on(api.projects.remove, async (req) => {
      await softDeleteProject(app.db, actorOf(req), req.params.id)
    }),
  ])
}
