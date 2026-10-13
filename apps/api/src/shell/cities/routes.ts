import { citiesResponse, citySearchQuery } from '@ctws/contracts'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { findCities } from './search'

/** City lookup for any module's inputs; the table is the same for every workspace. */
export const cityRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/cities',
    { schema: { querystring: citySearchQuery, response: { 200: citiesResponse } } },
    async (req) => ({ cities: findCities(req.query.q) }),
  )
}
