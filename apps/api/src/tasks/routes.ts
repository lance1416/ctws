import {
  createProjectBody,
  createTaskBody,
  projectResponse,
  taskResponse,
  updateProjectBody,
  updateTaskBody,
} from '@ctws/contracts'
import type { FastifyPluginAsync, FastifyReply } from 'fastify'
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
import {
  createTask,
  DepthLimitError,
  listProjectTasks,
  ManualProgressOnParentError,
  softDeleteTask,
  TaskNotFoundError,
  updateTask,
  type Task,
} from './tasks'

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

function toTaskResponse(t: Task): z.infer<typeof taskResponse> {
  return {
    id: t.id,
    projectId: t.projectId,
    parentId: t.parentId,
    title: t.title,
    notes: t.notes,
    status: t.status as z.infer<typeof taskResponse>['status'],
    scheduledOn: t.scheduledOn,
    dueAt: t.dueAt ? t.dueAt.toISOString() : null,
    rank: t.rank,
    manualProgress: t.manualProgress === null ? null : Number(t.manualProgress),
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }
}

const idParams = z.object({ id: z.uuid() }).strict()
const listQuery = z.object({ archived: z.enum(['true', 'false']).optional() }).strict()

// Domain failures map to problem responses; anything else is a bug and propagates to the
// global error handler. Not-found covers a missing task, parent, or project alike (no probing).
function sendTaskProblem(reply: FastifyReply, error: unknown): void {
  if (error instanceof TaskNotFoundError || error instanceof ProjectNotFoundError) {
    return sendProblem(reply, 404, 'Not Found')
  }
  if (error instanceof DepthLimitError || error instanceof ManualProgressOnParentError) {
    return sendProblem(reply, 409, 'Conflict', error.message)
  }
  throw error
}

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

  typed.get(
    '/projects/:id/tasks',
    {
      preHandler: requireUser,
      schema: {
        params: idParams,
        response: { 200: z.object({ tasks: z.array(taskResponse) }).strict() },
      },
    },
    async (req, reply) => {
      try {
        const rows = await listProjectTasks(app.db, authedUser(req).workspaceId, req.params.id)
        return { tasks: rows.map(toTaskResponse) }
      } catch (error) {
        return sendTaskProblem(reply, error)
      }
    },
  )

  typed.post(
    '/tasks',
    {
      preHandler: requireUser,
      schema: { body: createTaskBody, response: { 201: taskResponse } },
    },
    async (req, reply) => {
      const user = authedUser(req)
      try {
        const row = await createTask(
          app.db,
          { workspaceId: user.workspaceId, actorUserId: user.id },
          req.body,
        )
        return reply.status(201).send(toTaskResponse(row))
      } catch (error) {
        return sendTaskProblem(reply, error)
      }
    },
  )

  typed.patch(
    '/tasks/:id',
    {
      preHandler: requireUser,
      schema: { params: idParams, body: updateTaskBody, response: { 200: taskResponse } },
    },
    async (req, reply) => {
      const user = authedUser(req)
      try {
        const row = await updateTask(
          app.db,
          { workspaceId: user.workspaceId, actorUserId: user.id },
          req.params.id,
          req.body,
        )
        return toTaskResponse(row)
      } catch (error) {
        return sendTaskProblem(reply, error)
      }
    },
  )

  typed.delete(
    '/tasks/:id',
    { preHandler: requireUser, schema: { params: idParams } },
    async (req, reply) => {
      const user = authedUser(req)
      try {
        await softDeleteTask(
          app.db,
          { workspaceId: user.workspaceId, actorUserId: user.id },
          req.params.id,
        )
        return reply.status(204).send()
      } catch (error) {
        return sendTaskProblem(reply, error)
      }
    },
  )
}
