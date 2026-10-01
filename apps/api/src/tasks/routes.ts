import { createProjectBody, projectResponse, updateProjectBody } from '@ctws/contracts'
import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { authedUser, requireUser } from '../auth/require-user'
import { sendProblem } from '../problem'
import {
  createProject,
  listProjects,
  ProjectNotFoundError,
  softDeleteProject,
  updateProject,
  type Project,
} from './projects'

function toProjectResponse(p: Project): z.infer<typeof projectResponse> {
  return {
    id: p.id,
    workspaceId: p.workspaceId,
    name: p.name,
    color: p.color,
    rank: p.rank,
    archivedAt: p.archivedAt ? p.archivedAt.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
  }
}

const idParams = z.object({ id: z.uuid() }).strict()
const listQuery = z.object({ archived: z.enum(['true', 'false']).optional() }).strict()

export const taskRoutes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<ZodTypeProvider>()

  typed.get(
    '/projects',
    {
      preHandler: requireUser,
      schema: {
        querystring: listQuery,
        response: { 200: z.object({ projects: z.array(projectResponse) }).strict() },
      },
    },
    async (req) => {
      const rows = await listProjects(app.db, authedUser(req).workspaceId, {
        archived: req.query.archived === 'true',
      })
      return { projects: rows.map(toProjectResponse) }
    },
  )

  typed.post(
    '/projects',
    {
      preHandler: requireUser,
      schema: { body: createProjectBody, response: { 201: projectResponse } },
    },
    async (req, reply) => {
      const row = await createProject(app.db, authedUser(req).workspaceId, req.body)
      return reply.status(201).send(toProjectResponse(row))
    },
  )

  typed.patch(
    '/projects/:id',
    {
      preHandler: requireUser,
      schema: { params: idParams, body: updateProjectBody, response: { 200: projectResponse } },
    },
    async (req, reply) => {
      try {
        const row = await updateProject(
          app.db,
          authedUser(req).workspaceId,
          req.params.id,
          req.body,
        )
        return toProjectResponse(row)
      } catch (error) {
        if (error instanceof ProjectNotFoundError) return sendProblem(reply, 404, 'Not Found')
        throw error
      }
    },
  )

  typed.delete(
    '/projects/:id',
    { preHandler: requireUser, schema: { params: idParams } },
    async (req, reply) => {
      try {
        await softDeleteProject(app.db, authedUser(req).workspaceId, req.params.id)
        return reply.status(204).send()
      } catch (error) {
        if (error instanceof ProjectNotFoundError) return sendProblem(reply, 404, 'Not Found')
        throw error
      }
    },
  )
}
