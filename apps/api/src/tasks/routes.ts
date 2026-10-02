import {
  createProjectBody,
  createTaskBody,
  moveTaskBody,
  projectResponse,
  taskEventResponse,
  taskResponse,
  todayTaskResponse,
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
import { InboxNotDeletableError, TaskNotFoundError } from './errors'
import { DEFAULT_EVENT_LIMIT, InvalidCursorError, listTaskEvents, MAX_EVENT_LIMIT } from './events'
import { listToday, type TodayTask } from './today'
import { CycleError, InvalidNeighbourError, moveTask } from './move'
import {
  createTask,
  DepthLimitError,
  listProjectTasks,
  ManualProgressOnParentError,
  softDeleteTask,
  updateTask,
  type Task,
} from './tasks'

function toProjectResponse(p: Project): z.infer<typeof projectResponse> {
  return {
    id: p.id,
    workspaceId: p.workspaceId,
    name: p.name,
    color: p.color,
    isInbox: p.isInbox,
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

function toTodayResponse(t: TodayTask): z.infer<typeof todayTaskResponse> {
  return {
    ...toTaskResponse(t),
    projectName: t.projectName,
    parentTitle: t.parentTitle,
    segment: t.segment,
  }
}

const idParams = z.object({ id: z.uuid() }).strict()
const listQuery = z.object({ archived: z.enum(['true', 'false']).optional() }).strict()
const eventsQuery = z
  .object({
    cursor: z.string().max(256).optional(),
    limit: z.coerce.number().int().min(1).max(MAX_EVENT_LIMIT).default(DEFAULT_EVENT_LIMIT),
  })
  .strict()

// Domain failures map to problem responses; anything else is a bug and propagates to the
// global error handler. Not-found covers a missing task, parent, or project alike (no probing).
function sendTaskProblem(reply: FastifyReply, error: unknown): void {
  if (error instanceof TaskNotFoundError || error instanceof ProjectNotFoundError) {
    return sendProblem(reply, 404, 'Not Found')
  }
  if (
    error instanceof DepthLimitError ||
    error instanceof ManualProgressOnParentError ||
    error instanceof CycleError ||
    error instanceof InboxNotDeletableError
  ) {
    return sendProblem(reply, 409, 'Conflict', error.message)
  }
  // A malformed position is the caller's own mistake, and naming a neighbour they already hold
  // leaks nothing, so it is told apart from a not-found.
  if (error instanceof InvalidNeighbourError || error instanceof InvalidCursorError) {
    return sendProblem(reply, 400, 'Bad Request', error.message)
  }
  throw error
}

export const taskRoutes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<ZodTypeProvider>()

  typed.get(
    '/today',
    {
      preHandler: requireUser,
      schema: { response: { 200: z.object({ tasks: z.array(todayTaskResponse) }).strict() } },
    },
    async (req) => {
      const user = authedUser(req)
      // The timezone comes from the user record, not from a request header or the server clock.
      const rows = await listToday(app.db, user.workspaceId, user.timezone)
      return { tasks: rows.map(toTodayResponse) }
    },
  )

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
        return sendTaskProblem(reply, error)
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
        return sendTaskProblem(reply, error)
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

  // A separate endpoint rather than part of PATCH (spec 8.3): move carries a whole set of
  // invariants -- cycle, depth, project_id cascade, rank -- that a generic PATCH must not
  // quietly take on.
  typed.post(
    '/tasks/:id/move',
    {
      preHandler: requireUser,
      schema: { params: idParams, body: moveTaskBody, response: { 200: taskResponse } },
    },
    async (req, reply) => {
      const user = authedUser(req)
      try {
        const row = await moveTask(
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

  typed.get(
    '/tasks/:id/events',
    {
      preHandler: requireUser,
      schema: {
        params: idParams,
        querystring: eventsQuery,
        response: {
          200: z
            .object({
              events: z.array(taskEventResponse),
              nextCursor: z.string().nullable(),
            })
            .strict(),
        },
      },
    },
    async (req, reply) => {
      try {
        return await listTaskEvents(app.db, authedUser(req).workspaceId, req.params.id, req.query)
      } catch (error) {
        return sendTaskProblem(reply, error)
      }
    },
  )
}
