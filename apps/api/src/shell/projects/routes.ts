import {
  createProjectBody,
  projectParams,
  projectListQuery,
  projectListResponse,
  projectResponse,
  updateProjectBody,
} from '@ctws/contracts'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { currentUser } from '../auth/authenticated'
import type { ProjectColumns } from '../module'
import { toProjectListItem, toProjectResponse } from './mapper'
import { listProjects } from './queries'
import { createProject, softDeleteProject, updateProject } from './service'

/** Projects belong to the shell; modules add columns to the list but do not own them. */
export const projectRoutes: FastifyPluginAsyncZod<{ columns: ProjectColumns }> = async (
  app,
  { columns },
) => {
  app.get(
    '/projects',
    { schema: { querystring: projectListQuery, response: { 200: projectListResponse } } },
    async (req) => {
      const rows = await listProjects(
        app.db,
        currentUser(req).workspaceId,
        { archived: req.query.archived === 'true' },
        columns,
      )
      return { projects: rows.map(toProjectListItem) }
    },
  )

  app.post(
    '/projects',
    { schema: { body: createProjectBody, response: { 201: projectResponse } } },
    async (req, reply) => {
      const row = await createProject(app.db, currentUser(req).workspaceId, req.body)
      return reply.status(201).send(toProjectResponse(row))
    },
  )

  app.patch(
    '/projects/:id',
    {
      schema: {
        params: projectParams,
        body: updateProjectBody,
        response: { 200: projectResponse },
      },
    },
    async (req) => {
      const row = await updateProject(app.db, currentUser(req).workspaceId, req.params.id, req.body)
      return toProjectResponse(row)
    },
  )

  app.delete('/projects/:id', { schema: { params: projectParams } }, async (req, reply) => {
    await softDeleteProject(app.db, currentUser(req).workspaceId, req.params.id)
    return reply.status(204).send()
  })
}
