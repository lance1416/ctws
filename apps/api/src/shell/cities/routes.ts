import { api } from '@ctws/contracts'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { cacheForADay } from '../../platform/http/cache'
import { on, serve } from '../../platform/http/serve'
import { findCities } from './search'

/** City lookup for any module's inputs; the table is the same for every workspace. */
export const cityRoutes: FastifyPluginAsyncZod = async (app) => {
  serve(app, [
    on(api.cities.search, async (req, reply) => {
      cacheForADay(reply)
      return { cities: findCities(req.query.q) }
    }),
  ])
}
