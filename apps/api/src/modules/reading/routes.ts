import {
  calendarEntriesResponse,
  calendarQuery,
  createReadingItemBody,
  readingItemResponse,
  readingListQuery,
  searchQuery,
  updateReadingItemBody,
} from '@ctws/contracts'
import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { authedUser, requireUser } from '../../shell/auth/require-user'
import { listReadingCalendar } from './calendar'
import type { Queryable } from '../../platform/db/client'
import type { Env } from '../../platform/config'
import type { Unfurl } from './unfurl'
import {
  createReadingItem,
  listReadingItems,
  recordFetched,
  searchReadingItems,
  softDeleteReadingItem,
  updateReadingItem,
  type ReadingItemRow,
} from './store'

/**
 * THE SECOND MODULE's API, under its own namespace at `/api/v1/reading/`.
 *
 * The task module moved under `/api/v1/tasks/` precisely so this could exist beside it without
 * either knowing the other's paths. Projects stay flat at `/api/v1/projects`, because they are the
 * shell's.
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
    fetchedTitle: r.fetchedTitle,
    fetchedSummary: r.fetchedSummary,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }
}

/**
 * 粘一条链接之后，去读对面自己说的那句话。
 *
 * 条目**先落库**再抓：对面不回话、进程被杀，这一条都还在，而捕获从来不该因为别人的服务器而失败。
 * 抓取是同步等的（预算 2 秒），所以粘一条链接最慢多两秒 —— 换掉的是一个后台任务，而 v1 里没有
 * 任何后台（设计里就这么定的）。代价写在这里：慢的那两秒是看得见的。
 *
 * 人自己写了标题就不抓：他已经说了这是什么。书也不抓，它没有地址。
 */
async function withFetched(
  app: { db: Queryable; env: Env; unfurl: Unfurl },
  workspaceId: string,
  row: ReadingItemRow,
): Promise<ReadingItemRow> {
  if (!app.env.readingUnfurl) return row
  if (row.kind !== 'link' || row.url === null || row.title !== null) return row
  const facts = await app.unfurl(row.url).catch(() => null)
  return recordFetched(app.db, workspaceId, row.id, {
    title: facts?.title ?? null,
    summary: facts?.summary ?? null,
  })
}

const idParams = z.object({ id: z.uuid() }).strict()
const itemsResponse = z.object({ items: z.array(readingItemResponse) }).strict()

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
          endTime: null,
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
      const workspaceId = authedUser(req).workspaceId
      const created = await createReadingItem(app.db, workspaceId, req.body)
      return reply.code(201).send(toResponse(await withFetched(app, workspaceId, created)))
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
    async (req) => {
      const updated = await updateReadingItem(
        app.db,
        authedUser(req).workspaceId,
        req.params.id,
        req.body,
      )
      return toResponse(updated)
    },
  )

  typed.delete(
    '/:id',
    { preHandler: requireUser, schema: { params: idParams } },
    async (req, reply) => {
      await softDeleteReadingItem(app.db, authedUser(req).workspaceId, req.params.id)
      return reply.code(204).send()
    },
  )
}
