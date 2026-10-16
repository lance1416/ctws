import { api } from '@ctws/contracts'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { NotFound } from '../../platform/errors'
import { on, serve } from '../../platform/http/serve'
import { actorOf, currentUser } from '../auth/authenticated'
import { candidatesFor, exists, linksOf } from './read'
import type { LinkRegistry } from './registry'
import { linkObjects } from './service'
import { removeLink } from './store'

/** Candidates per type, so a box full of tasks still shows people. */
const CANDIDATES_PER_TYPE = 8

/** Edges join two modules' objects, so the shell owns them; each module only names its own. */
export const linkRoutes: FastifyPluginAsyncZod<{ registry: LinkRegistry }> = async (
  app,
  { registry },
) => {
  serve(app, [
    on(api.links.of, async (req) => {
      const { workspaceId } = currentUser(req)
      const of = req.params
      // A foreign or deleted object is a 404, not an empty page.
      if (!(await exists(registry, app.db, workspaceId, of))) throw new NotFound('Object')
      return linksOf(registry, app.db, workspaceId, of)
    }),

    on(api.links.candidates, async (req) => {
      const { workspaceId } = currentUser(req)
      const of = { type: req.query.type, id: req.query.id }
      if (!(await exists(registry, app.db, workspaceId, of))) throw new NotFound('Object')
      const candidates = await candidatesFor(
        registry,
        app.db,
        workspaceId,
        of,
        req.query.q ?? '',
        CANDIDATES_PER_TYPE,
      )
      return { candidates }
    }),

    // 201 whether or not the edge was already there.
    on(api.links.create, async (req) => {
      await linkObjects(registry, app.db, { ...actorOf(req), ...req.body })
      return { created: true }
    }),

    on(api.links.remove, async (req) => {
      const { workspaceId } = currentUser(req)
      const { fromType, fromId, toType, toId, kind } = req.query
      // Not checked against the model: a link stored before the model refused its kind must
      // still be removable.
      await removeLink(app.db, {
        workspaceId,
        from: { type: fromType, id: fromId },
        to: { type: toType, id: toId },
        kind,
      })
    }),
  ])
}
