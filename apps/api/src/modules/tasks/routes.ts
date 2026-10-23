import { api, type ObjectType } from '@ctws/contracts'
import { stagesOf } from '../../shell/projects'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { on, serve } from '../../platform/http/serve'
import { actorOf, currentUser } from '../../shell/auth'
import { nextAbout, type LinkRegistry } from '../../shell/links'
import { relatedAmong } from '../../shell/relations'
import { addDependency, createTask, removeDependency, deleteTask, updateTask } from './service'
import {
  toCalendarEntry,
  toCompletedResponse,
  toReadyResponse,
  toSearchResponse,
  toTaskResponse,
  toTodayResponse,
} from './mapper'
import {
  blockersFor,
  getTask,
  listCompleted,
  listProjectMovement,
  listReady,
  listReview,
  listTaskCalendar,
  listToday,
  projectBoard,
  searchTasks,
  taskDependencyLists,
} from './queries'

export const taskRoutes: FastifyPluginAsyncZod<{ registry: LinkRegistry }> = async (
  app,
  { registry },
) => {
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

    on(api.tasks.ready, async (req) => {
      const rows = await listReady(app.db, currentUser(req).workspaceId)
      return { tasks: rows.map(toReadyResponse) }
    }),

    on(api.tasks.review, async (req) => {
      const user = currentUser(req)
      return listReview(app.db, user.workspaceId, user.timezone, req.query, app.clock())
    }),

    on(api.tasks.completed, async (req) => {
      const user = currentUser(req)
      const { rows, page } = await listCompleted(app.db, user.workspaceId, user.timezone, req.query)
      return { tasks: rows.map(toCompletedResponse), page }
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
      const { rows, page } = await searchTasks(
        app.db,
        currentUser(req).workspaceId,
        req.query.q,
        req.query,
      )
      return { tasks: rows.map(toSearchResponse), page }
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
      const organisations = await relatedAmong(
        registry,
        app.db,
        user.workspaceId,
        { type: 'task', ids: board.tasks.map((t) => t.id) },
        'organisation',
      )
      // A card reads the soonest of what comes next about its node, the nodes above it and their
      // organisations (FR-058).
      const byId = new Map(board.tasks.map((t) => [t.id, t]))
      const about = new Map<string, ObjectType>()
      for (const staged of board.tasks.filter((t) => t.stageId !== null)) {
        for (let t = byId.get(staged.id); t; t = t.parentId ? byId.get(t.parentId) : undefined) {
          if (about.has(t.id)) break
          about.set(t.id, 'task')
          for (const o of organisations.get(t.id) ?? []) about.set(o.id, 'organisation')
        }
      }
      const next = await nextAbout(
        registry,
        app.db,
        user.workspaceId,
        [...about].map(([id, type]) => ({ type, id })),
        { now: app.clock(), projectId: req.query.projectId },
      )
      return {
        stages:
          (await stagesOf(app.db, user.workspaceId, [req.query.projectId])).get(
            req.query.projectId,
          ) ?? [],
        tasks: board.tasks.map(toTaskResponse),
        rollups: Object.fromEntries(board.rollups),
        blockers: Object.fromEntries(board.blockers),
        organisations: Object.fromEntries(organisations),
        next: Object.fromEntries(next),
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
      await deleteTask(app.db, actorOf(req), req.params.id)
    }),

    on(api.tasks.dependencies, async (req) =>
      taskDependencyLists(app.db, currentUser(req).workspaceId, req.params.id),
    ),

    // `:id` waits for `:blockerId`.
    on(api.tasks.addDependency, async (req) => {
      await addDependency(app.db, actorOf(req), {
        blockedId: req.params.id,
        blockerId: req.params.blockerId,
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
