import { api } from '@ctws/contracts'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { NotFound } from '../../platform/errors'
import { on, serve } from '../../platform/http/serve'
import { actorOf, currentUser } from '../auth/authenticated'
import { exists } from '../links/read'
import type { LinkRegistry } from '../links/registry'
import {
  addResource,
  pinnedOnActiveProjects,
  removeResource,
  resourcesOf,
  toResourceResponse,
  updateResource,
} from './store'

/** Resources hang on any kind of thing, so the shell owns them; the owner's module names it. */
export const resourceRoutes: FastifyPluginAsyncZod<{ registry: LinkRegistry }> = async (
  app,
  { registry },
) => {
  serve(app, [
    on(api.resources.of, async (req) => {
      const { workspaceId } = currentUser(req)
      if (!(await exists(registry, app.db, workspaceId, req.query))) throw new NotFound('Object')
      const rows = await resourcesOf(app.db, workspaceId, req.query)
      return { resources: rows.map(toResourceResponse) }
    }),

    on(api.resources.pinned, async (req) => {
      const rows = await pinnedOnActiveProjects(app.db, currentUser(req).workspaceId)
      return { resources: rows.map(toResourceResponse) }
    }),

    on(api.resources.create, async (req) => {
      const ctx = actorOf(req)
      const row = await app.db.transaction(async (tx) => {
        if (!(await exists(registry, tx, ctx.workspaceId, req.body.owner))) {
          throw new NotFound('Object')
        }
        return addResource(tx, ctx, req.body)
      })
      return toResourceResponse(row)
    }),

    on(api.resources.update, async (req) =>
      toResourceResponse(
        await app.db.transaction((tx) => updateResource(tx, actorOf(req), req.params.id, req.body)),
      ),
    ),

    on(api.resources.remove, async (req) => {
      await app.db.transaction((tx) => removeResource(tx, actorOf(req), req.params.id))
    }),
  ])
}
