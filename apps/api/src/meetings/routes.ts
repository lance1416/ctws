import {
  calendarEntry,
  calendarQuery,
  createMeetingBody,
  meetingListQuery,
  meetingResponse,
  updateMeetingBody,
} from '@ctws/contracts'
import type { FastifyPluginAsync, FastifyReply } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { authedUser, requireUser } from '../auth/require-user'
import { ContactNotFoundError } from '../contacts/errors'
import { sendProblem } from '../problem'
import { ProjectNotFoundError } from '../projects/errors'
import { BackwardsMeetingError, MeetingNotFoundError } from './errors'
import {
  createMeeting,
  getMeeting,
  listMeetings,
  softDeleteMeeting,
  updateMeeting,
  type MeetingRow,
} from './store'

/** THE FOURTH MODULE's API, under its own namespace at `/api/v1/meetings/`. */

function toResponse(m: MeetingRow): z.infer<typeof meetingResponse> {
  return {
    id: m.id,
    title: m.title,
    startsAt: m.startsAt.toISOString(),
    endsAt: m.endsAt.toISOString(),
    location: m.location,
    note: m.note,
    projectId: m.projectId,
    projectName: m.projectName,
    attendees: m.attendees,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  }
}

const idParams = z.object({ id: z.uuid() }).strict()
const listResponse = z.object({ meetings: z.array(meetingResponse) }).strict()

function sendMeetingProblem(reply: FastifyReply, error: unknown): void {
  // A project or a person from another workspace reads as "not found" too, never as a refusal
  // that would confirm the id exists.
  if (error instanceof MeetingNotFoundError) return sendProblem(reply, 404, 'Not Found')
  if (error instanceof ProjectNotFoundError) return sendProblem(reply, 404, 'Not Found')
  if (error instanceof ContactNotFoundError) return sendProblem(reply, 404, 'Not Found')
  if (error instanceof BackwardsMeetingError) {
    return sendProblem(reply, 409, 'Conflict', error.message)
  }
  throw error
}

export const meetingRoutes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<ZodTypeProvider>()

  typed.get(
    '/',
    {
      preHandler: requireUser,
      schema: { querystring: meetingListQuery, response: { 200: listResponse } },
    },
    async (req) => {
      const user = authedUser(req)
      const rows = await listMeetings(app.db, user.workspaceId, user.timezone, req.query)
      return { meetings: rows.map(toResponse) }
    },
  )

  /**
   * This module's dated things, for the shell's calendar.
   *
   * A meeting is the first entry that has a TIME: the day a deadline falls on is what matters
   * about it, where 「周四 14:00」 is the whole point of a meeting. Both the day and the clock are
   * decided here, in the account's zone.
   */
  typed.get(
    '/calendar',
    {
      preHandler: requireUser,
      schema: {
        querystring: calendarQuery,
        response: { 200: z.object({ entries: z.array(calendarEntry) }).strict() },
      },
    },
    async (req) => {
      const user = authedUser(req)
      const rows = await listMeetings(app.db, user.workspaceId, user.timezone, req.query)
      const day = new Intl.DateTimeFormat('en-CA', {
        timeZone: user.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
      const clock = new Intl.DateTimeFormat('zh-CN', {
        timeZone: user.timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
      return {
        entries: rows.map((m) => ({
          id: m.id,
          day: day.format(m.startsAt),
          title: m.title,
          to: '/calendar',
          kind: '会议',
          time: clock.format(m.startsAt),
          projectId: m.projectId,
          projectName: m.projectName,
        })),
      }
    },
  )

  typed.get(
    '/:id',
    { preHandler: requireUser, schema: { params: idParams, response: { 200: meetingResponse } } },
    async (req, reply) => {
      try {
        return toResponse(await getMeeting(app.db, authedUser(req).workspaceId, req.params.id))
      } catch (error) {
        return sendMeetingProblem(reply, error)
      }
    },
  )

  typed.post(
    '/',
    {
      preHandler: requireUser,
      schema: { body: createMeetingBody, response: { 201: meetingResponse } },
    },
    async (req, reply) => {
      try {
        // One transaction: a meeting and who is in it are one thing to arrange.
        const created = await app.db.transaction((tx) =>
          createMeeting(tx, authedUser(req).workspaceId, req.body),
        )
        return reply.code(201).send(toResponse(created))
      } catch (error) {
        return sendMeetingProblem(reply, error)
      }
    },
  )

  typed.patch(
    '/:id',
    {
      preHandler: requireUser,
      schema: { params: idParams, body: updateMeetingBody, response: { 200: meetingResponse } },
    },
    async (req, reply) => {
      try {
        const updated = await app.db.transaction((tx) =>
          updateMeeting(tx, authedUser(req).workspaceId, req.params.id, req.body),
        )
        return toResponse(updated)
      } catch (error) {
        return sendMeetingProblem(reply, error)
      }
    },
  )

  typed.delete(
    '/:id',
    { preHandler: requireUser, schema: { params: idParams } },
    async (req, reply) => {
      try {
        await softDeleteMeeting(app.db, authedUser(req).workspaceId, req.params.id)
        return reply.code(204).send()
      } catch (error) {
        return sendMeetingProblem(reply, error)
      }
    },
  )
}
