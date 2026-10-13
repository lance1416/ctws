import { citiesResponse, citySearchQuery } from '@ctws/contracts'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { findCities } from './search'

/**
 * 城市的那一张表，开放给输入框。
 *
 * 是 SHELL 的，不是 people 模块的：一个会议的地点、一份简历的城市，将来都可能用它，而它本身
 * 不属于任何一个模块。没有工作区的概念 —— 这张表对谁都一样，所以这条路只要求登录。
 */
export const cityRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/cities',
    {
      schema: { querystring: citySearchQuery, response: { 200: citiesResponse } },
    },
    async (req) => ({ cities: findCities(req.query.q) }),
  )
}
