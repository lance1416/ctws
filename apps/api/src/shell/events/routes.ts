import { api } from '@ctws/contracts'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { on, serve } from '../../platform/http/serve'
import { currentUser } from '../auth'
import { exists } from '../links/read'
import type { LinkRegistry } from '../links/registry'
import { NotFound } from '../../platform/errors'
import { readTimeline, type TimelineSource } from './timeline'

type Opts = { registry: LinkRegistry; sources: readonly TimelineSource[] }

/** A thing's timeline. The thing must be one this workspace can see, like a link's end. */
export const timelineRoutes: FastifyPluginAsyncZod<Opts> = async (app, { registry, sources }) => {
  serve(app, [
    on(api.timeline.of, async (req) => {
      const { workspaceId } = currentUser(req)
      const subject = { type: req.query.type, id: req.query.id }
      if (!(await exists(registry, app.db, workspaceId, subject))) throw new NotFound('Object')
      const { rows, page } = await readTimeline(
        app.db,
        sources,
        workspaceId,
        subject,
        req.query.kinds,
        { ...req.query, now: app.clock() },
      )
      return { entries: rows, page }
    }),
  ])
}
