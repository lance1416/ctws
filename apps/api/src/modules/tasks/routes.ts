import { api } from '@ctws/contracts'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { on, serve } from '../../platform/http/serve'
import { actorOf, currentUser } from '../../shell/auth/authenticated'
import { createTask } from './commands/create'
import { addDependency, removeDependency } from './commands/dependencies'
import { softDeleteTask } from './commands/remove'
import { updateTask } from './commands/update'
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
import { getTask } from './queries/scope'
import { searchTasks } from './queries/search'
import { listToday } from './queries/today'

export const taskRoutes: FastifyPluginAsyncZod = async (app) => {
  serve(app, [
    on(api.tasks.calendar, async (req) => {
      const user = currentUser(req)
      const rows = await listTaskCalendar(app.db, user.workspaceId, user.timezone, req.query)
      return { entries: rows.map(toCalendarEntry) }
    }),

    on(api.tasks.today, async (req) => {
      const user = currentUser(req)
      const rows = await listToday(app.db, user.workspaceId, user.timezone, app.clock())
      const blockers = await blockersFor(
        app.db,
        user.workspaceId,
        rows.map((t) => t.id),
      )
      return { tasks: rows.map((t) => toTodayResponse(t, blockers)) }
    }),

    on(api.tasks.review, async (req) => {
      const user = currentUser(req)
      return listReview(app.db, user.workspaceId, user.timezone, req.query, app.clock())
    }),

    on(api.tasks.completed, async (req) => {
      const user = currentUser(req)
      const { tasks, truncated } = await listCompleted(app.db, user.workspaceId, user.timezone)
      return { tasks: tasks.map(toCompletedResponse), truncated }
    }),

    on(api.tasks.movement, async (req) => {
      const user = currentUser(req)
      const projects = await listProjectMovement(
        app.db,
        user.workspaceId,
        user.timezone,
        app.clock(),
      )
      return { projects }
    }),

    on(api.tasks.search, async (req) => {
      const rows = await searchTasks(app.db, currentUser(req).workspaceId, req.query.q)
      return { tasks: rows.map(toSearchResponse) }
    }),

    // A project's tasks: the project is a filter on this collection, not a path segment.
    on(api.tasks.board, async (req) => {
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
    }),

    on(api.tasks.create, async (req) =>
      toTaskResponse(await createTask(app.db, actorOf(req), req.body)),
    ),

    on(api.tasks.get, async (req) =>
      toTaskResponse(await getTask(app.db, currentUser(req).workspaceId, req.params.id)),
    ),

    on(api.tasks.update, async (req) =>
      toTaskResponse(await updateTask(app.db, actorOf(req), req.params.id, req.body)),
    ),

    on(api.tasks.remove, async (req) => {
      await softDeleteTask(app.db, actorOf(req), req.params.id)
    }),

    on(api.tasks.dependencies, async (req) =>
      taskDependencyLists(app.db, currentUser(req).workspaceId, req.params.id),
    ),

    // `:id` waits for the body's `blockerId`.
    on(api.tasks.addDependency, async (req) => {
      await addDependency(app.db, actorOf(req), {
        blockedId: req.params.id,
        blockerId: req.body.blockerId,
      })
    }),

    on(api.tasks.removeDependency, async (req) => {
      await removeDependency(app.db, actorOf(req), {
        blockedId: req.params.id,
        blockerId: req.params.blockerId,
      })
    }),
  ])
}
