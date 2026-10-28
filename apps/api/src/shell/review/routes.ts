import { api } from '@ctws/contracts'
import { addDays } from '@ctws/core'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { currentUser } from '../auth/authenticated'
import { on, serve } from '../../platform/http/serve'
import { instantOf } from '../../platform/zone'
import type { WeekCounts } from '../module'

/**
 * What every module counts of a week, for the review's "Also this week" (FR-081): meetings held,
 * messages sent, people added. The week runs to the end of its last day or to now, whichever is
 * first: a meeting later today has not been held.
 */
export const reviewCountRoutes: FastifyPluginAsyncZod<{ counters: readonly WeekCounts[] }> = async (
  app,
  { counters },
) => {
  serve(app, [
    on(api.review.counts, async (req) => {
      const { workspaceId, timezone } = currentUser(req)
      const from = instantOf(`${req.query.from}T00:00`, timezone)
      const end = instantOf(`${addDays(req.query.to, 1)}T00:00`, timezone)
      // Half open, so now itself is let in by the next millisecond: a person added this
      // instant was added this week.
      const justAfterNow = new Date(app.clock().getTime() + 1)
      const window = { from, to: end < justAfterNow ? end : justAfterNow }
      const counted = await Promise.all(counters.map((count) => count(app.db, workspaceId, window)))
      return { counts: Object.assign({}, ...counted) as Record<string, number> }
    }),
  ])
}
