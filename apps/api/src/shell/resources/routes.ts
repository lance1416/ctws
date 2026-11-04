import { api } from '@ctws/contracts'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { NotFound } from '../../platform/errors'
import { on, serve } from '../../platform/http/serve'
import { actorOf, currentUser } from '../auth/authenticated'
import { exists } from '../links/read'
import type { LinkRegistry } from '../links/registry'
import { previewOne } from './preview'
import {
  addResource,
  pinnedOnActiveProjects,
  refreshPreview,
  removeResource,
  resourcesOf,
  toResourceResponse,
  updateResource,
} from './store'
import type { Resource } from './tables'

/** Resources hang on any kind of thing, so the shell owns them; the owner's module names it. */
export const resourceRoutes: FastifyPluginAsyncZod<{ registry: LinkRegistry }> = async (
  app,
  { registry },
) => {
  const previews = { previews: app.previews !== null }
  /**
   * Starts fetching a waiting card at once, without the request waiting for it; the minute's
   * round picks up any this misses (the server stopping halfway, say).
   */
  const fetchCard = (row: Resource) => {
    const previewer = app.previews
    if (!previewer || row.previewState !== 'pending') return
    void previewOne(app.db, app.storage, previewer, row.id, app.clock).catch(() => undefined)
  }

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
        return addResource(tx, ctx, req.body, previews)
      })
      fetchCard(row)
      return toResourceResponse(row)
    }),

    on(api.resources.update, async (req) => {
      const row = await app.db.transaction((tx) =>
        updateResource(tx, actorOf(req), req.params.id, req.body, previews),
      )
      fetchCard(row)
      return toResourceResponse(row)
    }),

    on(api.resources.refreshPreview, async (req) => {
      const row = await app.db.transaction((tx) =>
        refreshPreview(tx, actorOf(req), req.params.id, previews),
      )
      fetchCard(row)
      return toResourceResponse(row)
    }),

    on(api.resources.remove, async (req) => {
      await app.db.transaction((tx) => removeResource(tx, actorOf(req), req.params.id))
    }),
  ])
}
