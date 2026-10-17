import { api } from '@ctws/contracts'
import { addDays, lunarDayLabel } from '@ctws/core'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { cacheForADay } from '../../platform/http/cache'
import { on, serve } from '../../platform/http/serve'

/** Each day's lunar label for the grid, served so the client skips a 750 KB calendar library. */
export const calendarDayRoutes: FastifyPluginAsyncZod = async (app) => {
  serve(app, [
    on(api.calendar.days, async (req, reply) => {
      // A day's lunar name never changes.
      cacheForADay(reply)
      const days: Record<string, string> = {}
      for (let day = req.query.from; day <= req.query.to; day = addDays(day, 1)) {
        days[day] = lunarDayLabel(day)
      }
      return { days }
    }),
  ])
}
