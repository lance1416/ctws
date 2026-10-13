import {
  addDependencyBody,
  blockersResponse,
  calendarEntriesResponse,
  calendarQuery,
  completedResponse,
  completedTaskResponse,
  createTaskBody,
  dependencyLists,
  type DependencyRef,
  moveTaskBody,
  projectMovementResponse,
  reviewQuery,
  reviewResponse,
  rollupsResponse,
  searchQuery,
  searchTaskResponse,
  taskEventResponse,
  taskResponse,
  todayTaskResponse,
  updateTaskBody,
} from '@ctws/contracts'
import type { FastifyRequest } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { currentUser } from '../../shell/auth/authenticated'
import { DEFAULT_EVENT_LIMIT, listTaskEvents, MAX_EVENT_LIMIT } from './events'
import { listCompleted, type CompletedTask } from './completed'
import { searchTasks, type SearchTask } from './search'
import { listProjectMovement } from './movement'
import { listToday, type TodayTask } from './today'
import { moveTask } from './move'
import {
  createTask,
  softDeleteTask,
  updateTask,
  visibleTask,
  type Task,
  type TaskCtx,
} from './tasks'
import { projectBoard } from './board'
import { listReview } from './review'
import { listTaskCalendar } from './calendar'
import { addDependency, blockersFor, removeDependency, taskDependencyLists } from './dependencies'

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

function toTodayResponse(
  t: TodayTask,
  blockers: Map<string, DependencyRef[]>,
): z.infer<typeof todayTaskResponse> {
  return {
    ...toTaskResponse(t),
    projectName: t.projectName,
    parentTitle: t.parentTitle,
    segment: t.segment,
    blockedBy: blockers.get(t.id) ?? [],
  }
}

function toCompletedResponse(t: CompletedTask): z.infer<typeof completedTaskResponse> {
  return {
    ...toTaskResponse(t),
    projectName: t.projectName,
    parentTitle: t.parentTitle,
    completedOn: t.completedOn,
  }
}

function toSearchResponse(t: SearchTask): z.infer<typeof searchTaskResponse> {
  return {
    ...toTaskResponse(t),
    projectName: t.projectName,
    parentTitle: t.parentTitle,
    projectArchived: t.projectArchived,
  }
}

const idParams = z.object({ id: z.uuid() }).strict()
const byProjectQuery = z.object({ projectId: z.uuid() }).strict()

const eventsQuery = z
  .object({
    cursor: z.string().max(256).optional(),
    limit: z.coerce.number().int().min(1).max(MAX_EVENT_LIMIT).default(DEFAULT_EVENT_LIMIT),
  })
  .strict()

/** Who is writing, for the services that log an event against the task they change. */
const actor = (req: FastifyRequest): TaskCtx => {
  const user = currentUser(req)
  return { workspaceId: user.workspaceId, actorUserId: user.id }
}

export const taskRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/calendar',
    {
      schema: {
        querystring: calendarQuery,
        response: { 200: calendarEntriesResponse },
      },
    },
    async (req) => {
      const user = currentUser(req)
      // The window is the client's; the DAY each thing falls on is the server's, in the account's
      // zone -- the same rule today / completed / review keep.
      const rows = await listTaskCalendar(app.db, user.workspaceId, user.timezone, req.query)
      return {
        entries: rows.map((r) => ({
          // A task can be both scheduled and due, so the task id alone is not unique on the grid.
          id: `${r.id}:${r.kind}`,
          day: r.day,
          title: r.title,
          to: `/tasks/today`,
          kind: r.kind,
          // A plan and a deadline are about the DAY; nobody reads one as "by 15:30".
          time: null,
          endTime: null,
          zone: null,
          projectId: r.project_id,
          projectName: r.project_name,
        })),
      }
    },
  )

  app.get(
    '/today',
    {
      schema: { response: { 200: z.object({ tasks: z.array(todayTaskResponse) }).strict() } },
    },
    async (req) => {
      const user = currentUser(req)
      // The timezone comes from the user record, not from a request header or the server clock.
      const rows = await listToday(app.db, user.workspaceId, user.timezone)
      // One query for the whole page, not one per row.
      const blockers = await blockersFor(
        app.db,
        user.workspaceId,
        rows.map((t) => t.id),
      )
      return { tasks: rows.map((t) => toTodayResponse(t, blockers)) }
    },
  )

  app.get(
    '/review',
    {
      schema: { querystring: reviewQuery, response: { 200: reviewResponse } },
    },
    async (req) => {
      const user = currentUser(req)
      // The week boundary is the SERVER's, in the account's zone, like every other boundary here.
      return listReview(app.db, user.workspaceId, user.timezone, req.query)
    },
  )

  app.get(
    '/completed',
    {
      schema: { response: { 200: completedResponse } },
    },
    async (req) => {
      const user = currentUser(req)
      const { tasks, truncated } = await listCompleted(app.db, user.workspaceId, user.timezone)
      return { tasks: tasks.map(toCompletedResponse), truncated }
    },
  )

  // Movement. Under the task module's namespace and not under `projects`: the numbers are task
  // semantics (finished, open, logged change) hung on a shell project, exactly as `today` and
  // `completed` are. The project itself stays the shell's.
  app.get(
    '/movement',
    {
      schema: {
        response: { 200: z.object({ projects: z.array(projectMovementResponse) }).strict() },
      },
    },
    async (req) => {
      const user = currentUser(req)
      // The week boundary and the day count come from the user record's timezone, never the
      // server clock's zone.
      const rows = await listProjectMovement(app.db, user.workspaceId, user.timezone)
      return { projects: rows }
    },
  )

  app.get(
    '/search',
    {
      schema: {
        querystring: searchQuery,
        response: { 200: z.object({ tasks: z.array(searchTaskResponse) }).strict() },
      },
    },
    async (req) => {
      const rows = await searchTasks(app.db, currentUser(req).workspaceId, req.query.q)
      return { tasks: rows.map(toSearchResponse) }
    },
  )

  // The project is the shell's and the tasks under it are the module's, so the project is a
  // FILTER on the module's own collection rather than a parent path segment the module hangs its
  // routes off. `GET /api/v1/projects/:id/tasks` still answers, by redirect (`compat.ts`).
  app.get(
    '/',
    {
      schema: {
        querystring: byProjectQuery,
        response: {
          200: z
            .object({
              tasks: z.array(taskResponse),
              rollups: rollupsResponse,
              blockers: blockersResponse,
            })
            .strict(),
        },
      },
    },
    async (req) => {
      const user = currentUser(req)
      // Three reads, ONE snapshot -- `board.ts` has why that matters and how it is held.
      const board = await projectBoard(app.db, user.workspaceId, req.query.projectId, user.timezone)
      return {
        tasks: board.tasks.map(toTaskResponse),
        rollups: Object.fromEntries(board.rollups),
        blockers: Object.fromEntries(board.blockers),
      }
    },
  )

  app.post(
    '/',
    {
      schema: { body: createTaskBody, response: { 201: taskResponse } },
    },
    async (req, reply) => {
      const row = await createTask(app.db, actor(req), req.body)
      return reply.status(201).send(toTaskResponse(row))
    },
  )

  // One task by its id: where a link to it finds the project it lives in.
  app.get(
    '/:id',
    { schema: { params: idParams, response: { 200: taskResponse } } },
    async (req) => {
      return toTaskResponse(await visibleTask(app.db, actor(req).workspaceId, req.params.id))
    },
  )

  app.patch(
    '/:id',
    {
      schema: { params: idParams, body: updateTaskBody, response: { 200: taskResponse } },
    },
    async (req) => {
      const row = await updateTask(app.db, actor(req), req.params.id, req.body)
      return toTaskResponse(row)
    },
  )

  // A separate endpoint rather than part of PATCH (spec 8.3): move carries a whole set of
  // invariants -- cycle, depth, project_id cascade, rank -- that a generic PATCH must not
  // quietly take on.
  app.post(
    '/:id/move',
    {
      schema: { params: idParams, body: moveTaskBody, response: { 200: taskResponse } },
    },
    async (req) => {
      const row = await moveTask(app.db, actor(req), req.params.id, req.body)
      return toTaskResponse(row)
    },
  )

  app.delete('/:id', { schema: { params: idParams } }, async (req, reply) => {
    await softDeleteTask(app.db, actor(req), req.params.id)
    return reply.status(204).send()
  })

  /**
   * ONE TASK WAITING FOR ANOTHER. Three routes, and the pair that writes is NOT a
   * `PATCH` on the task: a dependency is an edge between two tasks, and `PATCH /tasks/:id` is
   * for this task's own independent scalar fields -- the same division `move` is on the other
   * side of.
   */
  app.get(
    '/:id/dependencies',
    {
      schema: { params: idParams, response: { 200: dependencyLists } },
    },
    async (req) => {
      return await taskDependencyLists(app.db, currentUser(req).workspaceId, req.params.id)
    },
  )

  app.post(
    '/:id/dependencies',
    {
      // No response schema: a 204 has no body, and declaring one makes the type provider
      // demand `send(null)`. The task delete above is written the same way.
      schema: { params: idParams, body: addDependencyBody },
    },
    async (req, reply) => {
      // `:id` is the task that WAITS. The body names what it waits for, which reads the way
      // the sentence does: this task depends on that one.
      await addDependency(app.db, actor(req), req.params.id, req.body.blockerId)
      return reply.status(204).send()
    },
  )

  app.delete(
    '/:id/dependencies/:blockerId',
    {
      schema: { params: z.object({ id: z.uuid(), blockerId: z.uuid() }).strict() },
    },
    async (req, reply) => {
      await removeDependency(app.db, actor(req), req.params.id, req.params.blockerId)
      return reply.status(204).send()
    },
  )

  app.get(
    '/:id/events',
    {
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
    async (req) => {
      return await listTaskEvents(app.db, currentUser(req).workspaceId, req.params.id, req.query)
    },
  )
}
