import { api } from '@ctws/contracts'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { on, serve } from '../../platform/http/serve'
import { actorOf, currentUser } from '../../shell/auth/authenticated'
import { toReadingItemResponse } from './mapper'
import { getReadingItem, listReadingItems, readingEntries, searchReadingItems } from './queries'
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
    serve(app, [
      on(api.reading.list, async (req) => {
        const rows = await listReadingItems(
          app.db,
          currentUser(req).workspaceId,
          req.query.unfiled === 'true',
        )
        return { reading: rows.map(toReadingItemResponse) }
      }),

      on(api.reading.calendar, async (req) => ({
        entries: await readingEntries(app.db, currentUser(req).workspaceId, req.query),
      })),

      on(api.reading.search, async (req) => {
        const rows = await searchReadingItems(app.db, currentUser(req).workspaceId, req.query.q)
        return { reading: rows.map(toReadingItemResponse) }
      }),

      on(api.reading.get, async (req) =>
        toReadingItemResponse(
          await getReadingItem(app.db, currentUser(req).workspaceId, req.params.id),
        ),
      ),

      on(api.reading.create, async (req) => {
        const actor = actorOf(req)
        const created = await createReadingItem(app.db, actor, req.body)
        const row = await withFetched(deps, app.db, actor.workspaceId, created)
        return toReadingItemResponse(row)
      }),

      on(api.reading.update, async (req) =>
        toReadingItemResponse(
          await updateReadingItem(app.db, actorOf(req), req.params.id, req.body),
        ),
      ),

      on(api.reading.remove, async (req) => {
        await softDeleteReadingItem(app.db, actorOf(req), req.params.id)
      }),
    ])
  }
