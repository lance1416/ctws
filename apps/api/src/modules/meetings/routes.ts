import { api } from '@ctws/contracts'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { on, serve } from '../../platform/http/serve'
import { actorOf, currentUser } from '../../shell/auth'
import { toOccurrenceResponse, toSeriesResponse } from './mapper'
import { getMeeting, getOccurrence, listOccurrences, meetingEntries } from './queries'
import {
  cancelMeeting,
  continueSeries,
  createMeeting,
  updateOccurrence,
  updateSeries,
} from './service'
import { windowOf } from './zone'

export const meetingRoutes: FastifyPluginAsyncZod = async (app) => {
  serve(app, [
    on(api.meetings.list, async (req) => {
      const user = currentUser(req)
      const { rows, page } = await listOccurrences(
        app.db,
        user.workspaceId,
        windowOf(req.query.from, req.query.to, user.timezone),
        req.query,
      )
      return { meetings: rows.map(toOccurrenceResponse), page }
    }),

    on(api.meetings.calendar, async (req) => {
      const user = currentUser(req)
      const { rows, page } = await meetingEntries(
        app.db,
        user.workspaceId,
        req.query,
        user.timezone,
        req.query,
      )
      return { entries: rows, page }
    }),

    on(api.meetings.series, async (req) =>
      toSeriesResponse(await getMeeting(app.db, currentUser(req).workspaceId, req.params.id)),
    ),

    on(api.meetings.occurrence, async (req) => {
      const { id, recurrenceId } = req.params
      return toOccurrenceResponse(
        await getOccurrence(app.db, currentUser(req).workspaceId, id, recurrenceId),
      )
    }),

    on(api.meetings.create, async (req) =>
      toOccurrenceResponse(await createMeeting(app.db, actorOf(req), req.body)),
    ),

    on(api.meetings.update, async (req) =>
      toSeriesResponse(await updateSeries(app.db, actorOf(req), req.params.id, req.body)),
    ),

    on(api.meetings.updateOccurrence, async (req) => {
      const { id, recurrenceId } = req.params
      return toOccurrenceResponse(
        await updateOccurrence(app.db, actorOf(req), id, recurrenceId, req.body),
      )
    }),

    on(api.meetings.continueAs, async (req) =>
      toOccurrenceResponse(await continueSeries(app.db, actorOf(req), req.params.id, req.body)),
    ),

    on(api.meetings.cancel, async (req) => {
      await cancelMeeting(app.db, actorOf(req), req.params.id, 'all')
    }),

    on(api.meetings.cancelOccurrence, async (req) => {
      await cancelMeeting(app.db, actorOf(req), req.params.id, 'one', req.params.recurrenceId)
    }),

    on(api.meetings.cancelFrom, async (req) => {
      await cancelMeeting(app.db, actorOf(req), req.params.id, 'following', req.query.from)
    }),
  ])
}
