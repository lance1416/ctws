import { calendarDaysResponse, calendarQuery } from '@ctws/contracts'
import { addDays, lunarDayLabel } from '@ctws/core'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

/** Each day's lunar label for the grid, served so the client skips a 750 KB calendar library. */
export const calendarDayRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/calendar/days',
    { schema: { querystring: calendarQuery, response: { 200: calendarDaysResponse } } },
    async (req) => {
      const days: Record<string, string> = {}
      for (let day = req.query.from; day <= req.query.to; day = addDays(day, 1)) {
        days[day] = lunarDayLabel(day)
      }
      return { days }
    },
  )
}
