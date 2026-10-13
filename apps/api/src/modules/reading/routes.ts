import {
  calendarEntriesResponse,
  calendarQuery,
  createReadingItemBody,
  readingItemResponse,
  readingListQuery,
  searchQuery,
  updateReadingItemBody,
} from '@ctws/contracts'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { currentUser } from '../../shell/auth/authenticated'
import { listReadingCalendar } from './calendar'
import type { Queryable } from '../../platform/db/client'
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

/** How the reading module reaches the outside world. */
export type ReadingDeps = { unfurl: Unfurl; enabled: boolean }

/**
 * Fetches the page's own title for an untitled link, after the item is saved, so a slow or silent
 * site never loses the capture. Books and named links are left alone.
 */
async function withFetched(
  deps: ReadingDeps,
  db: Queryable,
  workspaceId: string,
  row: ReadingItemRow,
): Promise<ReadingItemRow> {
  if (!deps.enabled) return row
  if (row.kind !== 'link' || row.url === null || row.title !== null) return row
  const facts = await deps.unfurl(row.url).catch(() => null)
  return recordFetched(db, workspaceId, row.id, {
    title: facts?.title ?? null,
    summary: facts?.summary ?? null,
  })
}

const idParams = z.object({ id: z.uuid() }).strict()
const itemsResponse = z.object({ items: z.array(readingItemResponse) }).strict()

export const readingRoutes =
  (deps: ReadingDeps): FastifyPluginAsyncZod =>
  async (app) => {
    app.get(
      '/',
      {
        schema: { querystring: readingListQuery, response: { 200: itemsResponse } },
      },
      async (req) => {
        const { projectId, unfiled, status } = req.query
        const rows = await listReadingItems(app.db, currentUser(req).workspaceId, {
          ...(projectId ? { projectId } : {}),
          ...(unfiled === 'true' ? { unfiled: true } : {}),
          // Fastify gives one value for `?status=todo` and an array for a repeated key; the
          // contract accepts both and the store wants one shape.
          ...(status ? { statuses: Array.isArray(status) ? status : [status] } : {}),
        })
        return { items: rows.map(toResponse) }
      },
    )

    app.get(
      '/calendar',
      {
        schema: {
          querystring: calendarQuery,
          response: { 200: calendarEntriesResponse },
        },
      },
      async (req) => {
        const rows = await listReadingCalendar(app.db, currentUser(req).workspaceId, req.query)
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

    app.get(
      '/search',
      {
        schema: {
          querystring: searchQuery,
          response: { 200: itemsResponse },
        },
      },
      async (req) => {
        const rows = await searchReadingItems(app.db, currentUser(req).workspaceId, req.query.q)
        return { items: rows.map(toResponse) }
      },
    )

    app.post(
      '/',
      {
        schema: { body: createReadingItemBody, response: { 201: readingItemResponse } },
      },
      async (req, reply) => {
        const workspaceId = currentUser(req).workspaceId
        const created = await createReadingItem(app.db, workspaceId, req.body)
        return reply
          .code(201)
          .send(toResponse(await withFetched(deps, app.db, workspaceId, created)))
      },
    )

    app.patch(
      '/:id',
      {
        schema: {
          params: idParams,
          body: updateReadingItemBody,
          response: { 200: readingItemResponse },
        },
      },
      async (req) => {
        const updated = await updateReadingItem(
          app.db,
          currentUser(req).workspaceId,
          req.params.id,
          req.body,
        )
        return toResponse(updated)
      },
    )

    app.delete('/:id', { schema: { params: idParams } }, async (req, reply) => {
      await softDeleteReadingItem(app.db, currentUser(req).workspaceId, req.params.id)
      return reply.code(204).send()
    })
  }
