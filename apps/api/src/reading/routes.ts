import {
  calendarEntriesResponse,
  calendarQuery,
  createReadingItemBody,
  readingItemResponse,
  readingListQuery,
  searchQuery,
  updateReadingItemBody,
} from '@ctws/contracts'
import type { FastifyPluginAsync, FastifyReply } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { authedUser, requireUser } from '../auth/require-user'
import { sendProblem } from '../problem'
import { ProjectNotFoundError } from '../projects/errors'
import { ReadingItemNotFoundError, WrongKindError } from './errors'
import { listReadingCalendar } from './calendar'
import {
  createReadingItem,
  listReadingItems,
  searchReadingItems,
  softDeleteReadingItem,
  updateReadingItem,
  type ReadingItemRow,
} from './store'

/**
 * THE SECOND MODULE's API, under its own namespace at `/api/v1/reading/`.
 *
 * The task module moved under `/api/v1/tasks/` precisely so this could exist beside it without
 * either knowing the other's paths (module-boundary contract §3). Projects stay flat at
 * `/api/v1/projects`, because they are the shell's.
 */

function toResponse(r: ReadingItemRow): z.infer<typeof readingItemResponse> {
  return {
    id: r.id,
    kind: r.kind as z.infer<typeof readingItemResponse>['kind'],
    title: r.title,
    url: r.url,
    author: r.author,
    status: r.status as z.infer<typeof readingItemResponse>['status'],
    planOn: r.planOn,
    projectId: r.projectId,
    projectName: r.projectName,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }
}

const idParams = z.object({ id: z.uuid() }).strict()
const itemsResponse = z.object({ items: z.array(readingItemResponse) }).strict()

function sendReadingProblem(reply: FastifyReply, error: unknown): void {
  // A project from another workspace, like an item from another workspace, is "not found" and
  // never a refusal that would confirm the id exists.
  if (error instanceof ReadingItemNotFoundError) return sendProblem(reply, 404, 'Not Found')
  if (error instanceof ProjectNotFoundError) return sendProblem(reply, 404, 'Not Found')
  if (error instanceof WrongKindError) return sendProblem(reply, 409, 'Conflict', error.message)
  throw error
}

export const readingRoutes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<ZodTypeProvider>()

  typed.get(
    '/',
    {
      preHandler: requireUser,
      schema: { querystring: readingListQuery, response: { 200: itemsResponse } },
    },
    async (req) => {
      const { projectId, unfiled, status } = req.query
      const rows = await listReadingItems(app.db, authedUser(req).workspaceId, {
        ...(projectId ? { projectId } : {}),
        ...(unfiled === 'true' ? { unfiled: true } : {}),
        // Fastify gives one value for `?status=todo` and an array for a repeated key; the
        // contract accepts both and the store wants one shape.
        ...(status ? { statuses: Array.isArray(status) ? status : [status] } : {}),
      })
      return { items: rows.map(toResponse) }
    },
  )

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
      const rows = await listReadingCalendar(app.db, authedUser(req).workspaceId, req.query)
      return {
        entries: rows.map((r) => ({
          id: r.id,
          day: r.day,
          title: r.title,
          to: '/reading',
          kind: r.kind,
          // A plan and a deadline are about the DAY; nobody reads one as "by 15:30".
          time: null,
          zone: null,
          projectId: r.project_id,
          projectName: r.project_name,
        })),
      }
    },
  )

  typed.get(
    '/search',
    {
      preHandler: requireUser,
      schema: {
        querystring: searchQuery,
        response: { 200: itemsResponse },
      },
    },
    async (req) => {
      const rows = await searchReadingItems(app.db, authedUser(req).workspaceId, req.query.q)
      return { items: rows.map(toResponse) }
    },
  )

  typed.post(
    '/',
    {
      preHandler: requireUser,
      schema: { body: createReadingItemBody, response: { 201: readingItemResponse } },
    },
    async (req, reply) => {
      try {
        const created = await createReadingItem(app.db, authedUser(req).workspaceId, req.body)
        return reply.code(201).send(toResponse(created))
      } catch (error) {
        return sendReadingProblem(reply, error)
      }
    },
  )

  typed.patch(
    '/:id',
    {
      preHandler: requireUser,
      schema: {
        params: idParams,
        body: updateReadingItemBody,
        response: { 200: readingItemResponse },
      },
    },
    async (req, reply) => {
      try {
        const updated = await updateReadingItem(
          app.db,
          authedUser(req).workspaceId,
          req.params.id,
          req.body,
        )
        return toResponse(updated)
      } catch (error) {
        return sendReadingProblem(reply, error)
      }
    },
  )

  typed.delete(
    '/:id',
    { preHandler: requireUser, schema: { params: idParams } },
    async (req, reply) => {
      try {
        await softDeleteReadingItem(app.db, authedUser(req).workspaceId, req.params.id)
        return reply.code(204).send()
      } catch (error) {
        return sendReadingProblem(reply, error)
      }
    },
  )
}
