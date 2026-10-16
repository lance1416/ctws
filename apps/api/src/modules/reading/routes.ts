import {
  calendarEntriesResponse,
  calendarQuery,
  createReadingItemBody,
  idParams,
  readingItemResponse,
  readingItemsResponse,
  readingListQuery,
  searchQuery,
  updateReadingItemBody,
} from '@ctws/contracts'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { currentUser } from '../../shell/auth/authenticated'
import { toReadingItemResponse } from './mapper'
import { listReadingItems, readingEntries, searchReadingItems } from './queries'
import {
  createReadingItem,
  type ReadingDeps,
  softDeleteReadingItem,
  updateReadingItem,
  withFetched,
} from './service'

export const readingRoutes =
  (deps: ReadingDeps): FastifyPluginAsyncZod =>
  async (app) => {
    app.get(
      '/',
      { schema: { querystring: readingListQuery, response: { 200: readingItemsResponse } } },
      async (req) => {
        const rows = await listReadingItems(
          app.db,
          currentUser(req).workspaceId,
          req.query.unfiled === 'true',
        )
        return { items: rows.map(toReadingItemResponse) }
      },
    )

    app.get(
      '/calendar',
      { schema: { querystring: calendarQuery, response: { 200: calendarEntriesResponse } } },
      async (req) => ({
        entries: await readingEntries(app.db, currentUser(req).workspaceId, req.query),
      }),
    )

    app.get(
      '/search',
      { schema: { querystring: searchQuery, response: { 200: readingItemsResponse } } },
      async (req) => {
        const rows = await searchReadingItems(app.db, currentUser(req).workspaceId, req.query.q)
        return { items: rows.map(toReadingItemResponse) }
      },
    )

    app.post(
      '/',
      { schema: { body: createReadingItemBody, response: { 201: readingItemResponse } } },
      async (req, reply) => {
        const workspaceId = currentUser(req).workspaceId
        const created = await createReadingItem(app.db, workspaceId, req.body)
        const row = await withFetched(deps, app.db, workspaceId, created)
        return reply.code(201).send(toReadingItemResponse(row))
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
        return toReadingItemResponse(updated)
      },
    )

    app.delete('/:id', { schema: { params: idParams } }, async (req, reply) => {
      await softDeleteReadingItem(app.db, currentUser(req).workspaceId, req.params.id)
      return reply.code(204).send()
    })
  }
