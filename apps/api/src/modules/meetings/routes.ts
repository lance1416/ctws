import { api } from '@ctws/contracts'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { on, serve } from '../../platform/http/serve'
import { actorOf, currentUser } from '../../shell/auth/authenticated'
import { toOccurrenceResponse } from './mapper'
import { getOccurrence, listOccurrences, meetingEntries } from './queries'
import { cancelMeeting, createMeeting, updateMeeting } from './service'
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

    on(api.meetings.occurrence, async (req) => {
      const one = await getOccurrence(
        app.db,
        currentUser(req).workspaceId,
        req.params.id,
        req.query.recurrenceId,
      )
      return toOccurrenceResponse(one)
    }),

    on(api.meetings.create, async (req) =>
      toOccurrenceResponse(await createMeeting(app.db, actorOf(req), req.body)),
    ),

    on(api.meetings.update, async (req) =>
      toOccurrenceResponse(await updateMeeting(app.db, actorOf(req), req.params.id, req.body)),
    ),

    on(api.meetings.cancel, async (req) => {
      await cancelMeeting(app.db, actorOf(req), req.params.id, req.query)
    }),
  ])
}
