import { api } from '@ctws/contracts'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { NotFound } from '../../platform/errors'
import { on, serve } from '../../platform/http/serve'
import { currentUser } from '../auth/authenticated'
import { getTombstone } from './store'

/** A deleted thing's old address asks here what it was (FR-035). */
export const tombstoneRoutes: FastifyPluginAsyncZod = async (app) => {
  serve(app, [
    on(api.tombstones.get, async (req) => {
      const found = await getTombstone(app.db, currentUser(req).workspaceId, req.params)
      if (!found) throw new NotFound('Tombstone')
      return found
    }),
  ])
}
