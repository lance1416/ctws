import { api, type PersonId, type ReadingItemResponse, type WorkspaceId } from '@ctws/contracts'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { Queryable } from '../../platform/db/client'
import { on, serve } from '../../platform/http/serve'
import { actorOf, currentUser } from '../../shell/auth'
import type { LinkRegistry } from '../../shell/links'
import { toReadingItemResponse } from './mapper'
import {
  getReadingItem,
  listReadingItems,
  readingEntries,
  type ReadingItemRow,
  searchReadingItems,
} from './queries'
import {
  createReadingItem,
  type ReadingDeps,
  softDeleteReadingItem,
  updateReadingItem,
  withFetched,
} from './service'

/**
 * Adds a minute per account. A pasted link is fetched from its site, the API's one request out,
 * so a script cannot turn this into a way to aim it elsewhere; not yet measured: thirty is far
 * past anyone pasting by hand.
 */
const ADDS_PER_MINUTE = 30

/** Who recommended each item, named by the people module through the registry. */
async function respond(
  registry: LinkRegistry,
  q: Queryable,
  workspaceId: WorkspaceId,
  rows: readonly ReadingItemRow[],
): Promise<ReadingItemResponse[]> {
  const ids = [...new Set(rows.flatMap((r) => (r.recommendedBy ? [r.recommendedBy] : [])))]
  const names = new Map<PersonId, string>()
  if (ids.length > 0) {
    for (const who of await registry
      .of('person')
      .rows(q, workspaceId, { ids, limit: ids.length })) {
      names.set(who.id as PersonId, who.title)
    }
  }
  return rows.map((r) => toReadingItemResponse(r, names))
}

export const readingRoutes =
  (deps: ReadingDeps): FastifyPluginAsyncZod<{ registry: LinkRegistry }> =>
  async (app, { registry }) => {
    const one = async (q: Queryable, workspaceId: WorkspaceId, row: ReadingItemRow) =>
      (await respond(registry, q, workspaceId, [row]))[0]!
    serve(app, [
      on(api.reading.list, async (req) => {
        const { workspaceId } = currentUser(req)
        const { rows, page } = await listReadingItems(
          app.db,
          workspaceId,
          req.query.unfiled === 'true',
          req.query,
        )
        return { reading: await respond(registry, app.db, workspaceId, rows), page }
      }),

      on(api.reading.calendar, async (req) => ({
        entries: await readingEntries(app.db, currentUser(req).workspaceId, req.query),
      })),

      on(api.reading.search, async (req) => {
        const { workspaceId } = currentUser(req)
        const { rows, page } = await searchReadingItems(app.db, workspaceId, req.query.q, req.query)
        return { reading: await respond(registry, app.db, workspaceId, rows), page }
      }),

      on(api.reading.get, async (req) => {
        const { workspaceId } = currentUser(req)
        return one(app.db, workspaceId, await getReadingItem(app.db, workspaceId, req.params.id))
      }),

      on(
        api.reading.create,
        async (req) => {
          const actor = actorOf(req)
          const created = await createReadingItem(app.db, actor, req.body)
          const row = await withFetched(deps, app.db, actor.workspaceId, created)
          return one(app.db, actor.workspaceId, row)
        },
        {
          config: {
            rateLimit: {
              max: ADDS_PER_MINUTE,
              keyGenerator: (req) => `user:${currentUser(req).id}`,
            },
          },
        },
      ),

      on(api.reading.update, async (req) => {
        const actor = actorOf(req)
        const row = await updateReadingItem(registry, app.db, actor, req.params.id, req.body)
        return one(app.db, actor.workspaceId, row)
      }),

      on(api.reading.remove, async (req) => {
        await softDeleteReadingItem(app.db, actorOf(req), req.params.id)
      }),
    ])
  }
