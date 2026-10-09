import {
  completedTaskResponse,
  createTaskBody,
  moveTaskBody,
  reviewQuery,
  reviewResponse,
  projectMovementResponse,
  searchTaskResponse,
  taskEventResponse,
  rollupsResponse,
  calendarEntriesResponse,
  calendarQuery,
  addDependencyBody,
  blockersResponse,
  dependencyLists,
  type DependencyRef,
  taskResponse,
  todayTaskResponse,
  updateTaskBody,
} from '@ctws/contracts'
import type { FastifyPluginAsync, FastifyReply } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { authedUser, requireUser } from '../auth/require-user'
import { sendProblem } from '../problem'
import { InboxNotDeletableError, ProjectNotFoundError } from '../projects/errors'
import { DependencyCycleError, TaskNotFoundError } from './errors'
import { DEFAULT_EVENT_LIMIT, InvalidCursorError, listTaskEvents, MAX_EVENT_LIMIT } from './events'
import { listCompleted, type CompletedTask } from './completed'
import { searchTasks, type SearchTask } from './search'
import { listProjectMovement } from './movement'
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
import { projectRollups } from './rollup'
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
// Trimmed and non-empty: a blank query would otherwise match every task in the workspace, which
// is a full table scan dressed up as a search result.
const searchQuery = z.object({ q: z.string().trim().min(1).max(200) }).strict()
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
    error instanceof DependencyCycleError ||
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
    '/calendar',
    {
      preHandler: requireUser,
      schema: {
        querystring: calendarQuery,
        response: { 200: calendarEntriesResponse },
      },
    },
    async (req) => {
      const user = authedUser(req)
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
          // A plan and a deadline are about the DAY; 「15:30 之前」 is not how anyone reads one.
          time: null,
          zone: null,
          projectId: r.project_id,
          projectName: r.project_name,
        })),
      }
    },
  )

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
      // One query for the whole page, not one per row.
      const blockers = await blockersFor(
        app.db,
        user.workspaceId,
        rows.map((t) => t.id),
      )
      return { tasks: rows.map((t) => toTodayResponse(t, blockers)) }
    },
  )

  typed.get(
    '/review',
    {
      preHandler: requireUser,
      schema: { querystring: reviewQuery, response: { 200: reviewResponse } },
    },
    async (req) => {
      const user = authedUser(req)
      // The week boundary is the SERVER's, in the account's zone, like every other boundary here.
      return listReview(app.db, user.workspaceId, user.timezone, req.query)
    },
  )

  typed.get(
    '/completed',
    {
      preHandler: requireUser,
      schema: { response: { 200: z.object({ tasks: z.array(completedTaskResponse) }).strict() } },
    },
    async (req) => {
      const user = authedUser(req)
      const rows = await listCompleted(app.db, user.workspaceId, user.timezone)
      return { tasks: rows.map(toCompletedResponse) }
    },
  )

  // 做到哪儿了. Under the task module's namespace and not under `projects`: the numbers are task
  // semantics (finished, open, logged change) hung on a shell project, exactly as `today` and
  // `completed` are. The project itself stays the shell's.
  typed.get(
    '/movement',
    {
      preHandler: requireUser,
      schema: {
        response: { 200: z.object({ projects: z.array(projectMovementResponse) }).strict() },
      },
    },
    async (req) => {
      const user = authedUser(req)
      // The week boundary and the day count come from the user record's timezone, never the
      // server clock's zone.
      const rows = await listProjectMovement(app.db, user.workspaceId, user.timezone)
      return { projects: rows }
    },
  )

  typed.get(
    '/search',
    {
      preHandler: requireUser,
      schema: {
        querystring: searchQuery,
        response: { 200: z.object({ tasks: z.array(searchTaskResponse) }).strict() },
      },
    },
    async (req) => {
      const rows = await searchTasks(app.db, authedUser(req).workspaceId, req.query.q)
      return { tasks: rows.map(toSearchResponse) }
    },
  )

  // Was `GET /api/v1/projects/:id/tasks`. The project is the shell's, the tasks under it are the
  // module's, so the project is a FILTER on the module's own collection rather than a parent path
  // segment the module would be hanging routes off. The old path still answers, by redirect.
  typed.get(
    '/',
    {
      preHandler: requireUser,
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
    async (req, reply) => {
      try {
        const user = authedUser(req)
        // Two statements rather than one: `listProjectTasks` returns ROWS, and the rollup needs
        // two computed flags and a joined max beside them. Widening the row query would make its
        // result no longer a row, and at personal scale (spec §7.5) the second lookup is free.
        const rows = await listProjectTasks(app.db, user.workspaceId, req.query.projectId)
        const metrics = await projectRollups(
          app.db,
          user.workspaceId,
          req.query.projectId,
          user.timezone,
        )
        const blockers = await blockersFor(
          app.db,
          user.workspaceId,
          rows.map((t) => t.id),
        )
        return {
          tasks: rows.map(toTaskResponse),
          rollups: Object.fromEntries(metrics),
          blockers: Object.fromEntries(blockers),
        }
      } catch (error) {
        return sendTaskProblem(reply, error)
      }
    },
  )

  typed.post(
    '/',
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
    '/:id',
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
    '/:id/move',
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
    '/:id',
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

  /**
   * 「A 没做完 B 做不了」 (D64). Three routes, and the pair that writes is deliberately NOT a
   * `PATCH` on the task: a dependency is an edge between two tasks, and `PATCH /tasks/:id` is
   * for this task's own independent scalar fields -- the same division `move` is on the other
   * side of.
   */
  typed.get(
    '/:id/dependencies',
    {
      preHandler: requireUser,
      schema: { params: idParams, response: { 200: dependencyLists } },
    },
    async (req, reply) => {
      try {
        return await taskDependencyLists(app.db, authedUser(req).workspaceId, req.params.id)
      } catch (error) {
        return sendTaskProblem(reply, error)
      }
    },
  )

  typed.post(
    '/:id/dependencies',
    {
      preHandler: requireUser,
      // No response schema: a 204 has no body, and declaring one makes the type provider
      // demand `send(null)`. The task delete above is written the same way.
      schema: { params: idParams, body: addDependencyBody },
    },
    async (req, reply) => {
      try {
        const user = authedUser(req)
        // `:id` is the task that WAITS. The body names what it waits for, which reads the way
        // the sentence does: this task depends on that one.
        await addDependency(
          app.db,
          { workspaceId: user.workspaceId, actorUserId: user.id },
          req.params.id,
          req.body.blockerId,
        )
        return reply.status(204).send()
      } catch (error) {
        return sendTaskProblem(reply, error)
      }
    },
  )

  typed.delete(
    '/:id/dependencies/:blockerId',
    {
      preHandler: requireUser,
      schema: { params: z.object({ id: z.uuid(), blockerId: z.uuid() }).strict() },
    },
    async (req, reply) => {
      try {
        const user = authedUser(req)
        await removeDependency(
          app.db,
          { workspaceId: user.workspaceId, actorUserId: user.id },
          req.params.id,
          req.params.blockerId,
        )
        return reply.status(204).send()
      } catch (error) {
        return sendTaskProblem(reply, error)
      }
    },
  )

  typed.get(
    '/:id/events',
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
