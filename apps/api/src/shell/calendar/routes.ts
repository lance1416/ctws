import { calendarDaysResponse, calendarQuery } from '@ctws/contracts'
import { addDays, lunarDayLabel } from '@ctws/core'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

/**
 * WHAT DAY IT IS IN THE OLD CALENDAR, for the grid's squares.
 *
 * THE SHELL'S, not a module's: "what is 2026-10-10 in the lunar calendar" is a property of the
 * day, and asking people would be asking a module a question that has nothing to do with it.
 *
 * Answered here for the same reason every other calendar conversion is: the library that knows is
 * 750 KB, and a month of labels is a few hundred bytes and one request.
 */
export const calendarDayRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/calendar/days',
    {
      schema: { querystring: calendarQuery, response: { 200: calendarDaysResponse } },
    },
    async (req) => {
      const days: Record<string, string> = {}
      for (let day = req.query.from; day <= req.query.to; day = addDays(day, 1)) {
        days[day] = lunarDayLabel(day)
      }
      return { days }
    },
  )
}
