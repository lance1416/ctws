import {
  addDependencyBody,
  calendarEntriesResponse,
  calendarQuery,
  completedResponse,
  createTaskBody,
  dependencyLists,
  dependencyParams,
  idParams,
  moveTaskBody,
  movementResponse,
  projectTasksQuery,
  projectTasksResponse,
  reviewQuery,
  reviewResponse,
  searchQuery,
  searchTasksResponse,
  taskResponse,
  todayResponse,
  updateTaskBody,
} from '@ctws/contracts'
import type { FastifyRequest } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { currentUser } from '../../shell/auth/authenticated'
import { createTask } from './commands/create'
import { addDependency, removeDependency } from './commands/dependencies'
import { moveTask } from './commands/move'
import { softDeleteTask } from './commands/remove'
import { updateTask } from './commands/update'
import type { TaskCtx } from './log'
import {
  toCalendarEntry,
  toCompletedResponse,
  toSearchResponse,
  toTaskResponse,
  toTodayResponse,
} from './mapper'
import { listTaskCalendar } from './queries/calendar'
import { listCompleted } from './queries/completed'
import { blockersFor, taskDependencyLists } from './queries/dependencies'
import { projectBoard } from './queries/list'
import { listProjectMovement } from './queries/movement'
import { listReview } from './queries/review'
import { visibleTask } from './queries/scope'
import { searchTasks } from './queries/search'
import { listToday } from './queries/today'

/** The workspace a command writes and logs in. */
const actor = (req: FastifyRequest): TaskCtx => ({ workspaceId: currentUser(req).workspaceId })

export const taskRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/calendar',
    { schema: { querystring: calendarQuery, response: { 200: calendarEntriesResponse } } },
    async (req) => {
      const user = currentUser(req)
      const rows = await listTaskCalendar(app.db, user.workspaceId, user.timezone, req.query)
      return { entries: rows.map(toCalendarEntry) }
    },
  )

  app.get('/today', { schema: { response: { 200: todayResponse } } }, async (req) => {
    const user = currentUser(req)
    const rows = await listToday(app.db, user.workspaceId, user.timezone, app.clock())
    const blockers = await blockersFor(
      app.db,
      user.workspaceId,
      rows.map((t) => t.id),
    )
    return { tasks: rows.map((t) => toTodayResponse(t, blockers)) }
  })

  app.get(
    '/review',
    { schema: { querystring: reviewQuery, response: { 200: reviewResponse } } },
    async (req) => {
      const user = currentUser(req)
      return listReview(app.db, user.workspaceId, user.timezone, req.query, app.clock())
    },
  )

  app.get('/completed', { schema: { response: { 200: completedResponse } } }, async (req) => {
    const user = currentUser(req)
    const { tasks, truncated } = await listCompleted(app.db, user.workspaceId, user.timezone)
    return { tasks: tasks.map(toCompletedResponse), truncated }
  })

  app.get('/movement', { schema: { response: { 200: movementResponse } } }, async (req) => {
    const user = currentUser(req)
    const projects = await listProjectMovement(app.db, user.workspaceId, user.timezone, app.clock())
    return { projects }
  })

  app.get(
    '/search',
    { schema: { querystring: searchQuery, response: { 200: searchTasksResponse } } },
    async (req) => {
      const rows = await searchTasks(app.db, currentUser(req).workspaceId, req.query.q)
      return { tasks: rows.map(toSearchResponse) }
    },
  )

  // A project's tasks: the project is a filter on this collection, not a path segment.
  app.get(
    '/',
    { schema: { querystring: projectTasksQuery, response: { 200: projectTasksResponse } } },
    async (req) => {
      const user = currentUser(req)
      const board = await projectBoard(
        app.db,
        user.workspaceId,
        req.query.projectId,
        user.timezone,
        app.clock(),
      )
      return {
        tasks: board.tasks.map(toTaskResponse),
        rollups: Object.fromEntries(board.rollups),
        blockers: Object.fromEntries(board.blockers),
      }
    },
  )

  app.post(
    '/',
    { schema: { body: createTaskBody, response: { 201: taskResponse } } },
    async (req, reply) => {
      const row = await createTask(app.db, actor(req), req.body)
      return reply.status(201).send(toTaskResponse(row))
    },
  )

  app.get('/:id', { schema: { params: idParams, response: { 200: taskResponse } } }, async (req) =>
    toTaskResponse(await visibleTask(app.db, currentUser(req).workspaceId, req.params.id)),
  )

  app.patch(
    '/:id',
    { schema: { params: idParams, body: updateTaskBody, response: { 200: taskResponse } } },
    async (req) => toTaskResponse(await updateTask(app.db, actor(req), req.params.id, req.body)),
  )

  // Not part of PATCH: a move must keep the tree acyclic, within depth, and on one project.
  app.post(
    '/:id/move',
    { schema: { params: idParams, body: moveTaskBody, response: { 200: taskResponse } } },
    async (req) => toTaskResponse(await moveTask(app.db, actor(req), req.params.id, req.body)),
  )

  app.delete('/:id', { schema: { params: idParams } }, async (req, reply) => {
    await softDeleteTask(app.db, actor(req), req.params.id)
    return reply.status(204).send()
  })

  app.get(
    '/:id/dependencies',
    { schema: { params: idParams, response: { 200: dependencyLists } } },
    async (req) => taskDependencyLists(app.db, currentUser(req).workspaceId, req.params.id),
  )

  // `:id` waits for the body's `blockerId`.
  app.post(
    '/:id/dependencies',
    { schema: { params: idParams, body: addDependencyBody } },
    async (req, reply) => {
      await addDependency(app.db, actor(req), req.params.id, req.body.blockerId)
      return reply.status(204).send()
    },
  )

  app.delete(
    '/:id/dependencies/:blockerId',
    { schema: { params: dependencyParams } },
    async (req, reply) => {
      await removeDependency(app.db, actor(req), req.params.id, req.params.blockerId)
      return reply.status(204).send()
    },
  )
}
