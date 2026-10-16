import {
  calendarEntriesResponse,
  calendarQuery,
  createMeetingBody,
  deleteMeetingQuery,
  meetingParams,
  meetingOccurrence,
  meetingsResponse,
  occurrenceQuery,
  updateMeetingBody,
} from '@ctws/contracts'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { actorOf, currentUser } from '../../shell/auth/authenticated'
import { toOccurrenceResponse } from './mapper'
import { getOccurrence, listOccurrences, meetingEntries } from './queries'
import { cancelMeeting, createMeeting, updateMeeting } from './service'
import { windowOf } from './zone'

export const meetingRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/',
    { schema: { querystring: calendarQuery, response: { 200: meetingsResponse } } },
    async (req) => {
      const user = currentUser(req)
      const rows = await listOccurrences(
        app.db,
        user.workspaceId,
        windowOf(req.query.from, req.query.to, user.timezone),
      )
      return { meetings: rows.map(toOccurrenceResponse) }
    },
  )

  app.get(
    '/calendar',
    { schema: { querystring: calendarQuery, response: { 200: calendarEntriesResponse } } },
    async (req) => {
      const user = currentUser(req)
      return { entries: await meetingEntries(app.db, user.workspaceId, req.query, user.timezone) }
    },
  )

  app.get(
    '/:id',
    {
      schema: {
        params: meetingParams,
        querystring: occurrenceQuery,
        response: { 200: meetingOccurrence },
      },
    },
    async (req) => {
      const one = await getOccurrence(
        app.db,
        currentUser(req).workspaceId,
        req.params.id,
        req.query.recurrenceId,
      )
      return toOccurrenceResponse(one)
    },
  )

  app.post(
    '/',
    { schema: { body: createMeetingBody, response: { 201: meetingOccurrence } } },
    async (req, reply) => {
      const created = await createMeeting(app.db, actorOf(req), req.body)
      return reply.code(201).send(toOccurrenceResponse(created))
    },
  )

  app.patch(
    '/:id',
    {
      schema: {
        params: meetingParams,
        body: updateMeetingBody,
        response: { 200: meetingOccurrence },
      },
    },
    async (req) => {
      const updated = await updateMeeting(app.db, actorOf(req), req.params.id, req.body)
      return toOccurrenceResponse(updated)
    },
  )

  app.delete(
    '/:id',
    { schema: { params: meetingParams, querystring: deleteMeetingQuery } },
    async (req, reply) => {
      await cancelMeeting(app.db, actorOf(req), req.params.id, req.query)
      return reply.code(204).send()
    },
  )
}
