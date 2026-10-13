import {
  calendarEntriesResponse,
  calendarQuery,
  createMeetingBody,
  deleteMeetingQuery,
  meetingListQuery,
  meetingOccurrence,
  updateMeetingBody,
} from '@ctws/contracts'
import type { FastifyPluginAsync, FastifyReply } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { authedUser, requireUser } from '../../shell/auth/require-user'
import { PersonNotFoundError } from '../people/errors'
import { sendProblem } from '../../platform/http/problem'
import { ProjectNotFoundError } from '../../shell/projects/errors'
import {
  BadRuleError,
  MeetingNotFoundError,
  OccurrenceNotFoundError,
  OneOccurrenceLimitError,
} from './errors'
import { instantOf, localOf } from './occurrences'
import {
  cancelMeeting,
  createMeeting,
  getOccurrence,
  listOccurrences,
  updateMeeting,
  type OccurrenceRow,
} from './store'

/** THE FOURTH MODULE's API, under its own namespace at `/api/v1/meetings/`. */

function toResponse(o: OccurrenceRow): z.infer<typeof meetingOccurrence> {
  return {
    meetingId: o.meetingId,
    recurrenceId: o.recurrenceId,
    title: o.title,
    startsLocal: o.startsLocal,
    timeZone: o.timeZone,
    durationMinutes: o.durationMinutes,
    startsAt: o.startsAt.toISOString(),
    endsAt: o.endsAt.toISOString(),
    rrule: o.rrule,
    overridden: o.overridden,
    location: o.location,
    note: o.note,
    projectId: o.projectId,
    projectName: o.projectName,
    attendees: o.attendees,
  }
}

const idParams = z.object({ id: z.uuid() }).strict()
const listResponse = z.object({ meetings: z.array(meetingOccurrence) }).strict()
const DAY = 86_400_000

/**
 * A pair of ACCOUNT calendar days as the pair of instants the expansion needs.
 *
 * The one conversion between the two notions of time this module holds: a person asks in their
 * own days, events each carry their own zone, and an instant is the only thing the two can be
 * compared through.
 */
function windowOf(from: string, to: string, timezone: string): { from: Date; to: Date } {
  return {
    from: instantOf(`${from}T00:00`, timezone),
    // The END of `to`, i.e. the start of the day after: a meeting at 23:30 on the last day is
    // inside a window that names that day.
    to: new Date(instantOf(`${to}T00:00`, timezone).getTime() + DAY),
  }
}

function sendMeetingProblem(reply: FastifyReply, error: unknown): void {
  // A project or a person from another workspace reads as "not found" too, never as a refusal
  // that would confirm the id exists.
  if (error instanceof MeetingNotFoundError) return sendProblem(reply, 404, 'Not Found')
  if (error instanceof OccurrenceNotFoundError) return sendProblem(reply, 404, 'Not Found')
  if (error instanceof ProjectNotFoundError) return sendProblem(reply, 404, 'Not Found')
  if (error instanceof PersonNotFoundError) return sendProblem(reply, 404, 'Not Found')
  if (error instanceof BadRuleError) {
    return sendProblem(reply, 422, 'Unprocessable Entity', error.message)
  }
  if (error instanceof OneOccurrenceLimitError) {
    return sendProblem(reply, 409, 'Conflict', error.message)
  }
  throw error
}

/** "EST" / "BST": the zone's own short name at that moment, which is what a person says. */
export function zoneLabel(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'short',
  }).formatToParts(at)
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? timeZone
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
      // A list with no window means the month ahead: a recurring meeting has no last occurrence,
      // so "everything" is not an answer anyone can be given.
      const from = req.query.from ?? localOf(new Date(), user.timezone).slice(0, 10)
      const to =
        req.query.to ?? localOf(new Date(Date.now() + 31 * DAY), user.timezone).slice(0, 10)
      const rows = await listOccurrences(
        app.db,
        user.workspaceId,
        windowOf(from, to, user.timezone),
        req.query.projectId ? { projectId: req.query.projectId } : {},
      )
      return { meetings: rows.map(toResponse) }
    },
  )

  /**
   * This module's dated things, for the shell's calendar.
   *
   * A meeting is the first entry with a TIME on it. The clock shown is the ACCOUNT's -- when to be
   * there is the question a calendar answers -- and the event's own zone travels alongside, so a
   * meeting agreed as 09:00 in Toronto can still say so.
   */
  typed.get(
    '/calendar',
    {
      preHandler: requireUser,
      schema: {
        querystring: calendarQuery,
        response: { 200: calendarEntriesResponse },
      },
    },
    async (req) => {
      const user = authedUser(req)
      const rows = await listOccurrences(
        app.db,
        user.workspaceId,
        windowOf(req.query.from, req.query.to, user.timezone),
      )
      const clock = new Intl.DateTimeFormat('zh-CN', {
        timeZone: user.timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
      return {
        entries: rows.map((m) => ({
          // A series shows several times on one grid, so the series id alone is not unique.
          id: `${m.meetingId}:${m.recurrenceId}`,
          day: localOf(m.startsAt, user.timezone).slice(0, 10),
          title: m.title,
          to: '/calendar',
          kind:
            m.timeZone === user.timezone
              ? 'Meetings'
              : `meeting · ${zoneLabel(m.startsAt, m.timeZone)} ${localOf(m.startsAt, m.timeZone).slice(11)}`,
          time: clock.format(m.startsAt),
          endTime: clock.format(new Date(m.startsAt.getTime() + m.durationMinutes * 60_000)),
          zone: m.timeZone === user.timezone ? null : zoneLabel(m.startsAt, m.timeZone),
          projectId: m.projectId,
          projectName: m.projectName,
        })),
      }
    },
  )

  typed.get(
    '/:id',
    {
      preHandler: requireUser,
      schema: {
        params: idParams,
        querystring: z.object({ recurrenceId: z.string().optional() }).strict(),
        response: { 200: meetingOccurrence },
      },
    },
    async (req, reply) => {
      try {
        const one = await getOccurrence(
          app.db,
          authedUser(req).workspaceId,
          req.params.id,
          req.query.recurrenceId,
        )
        return toResponse(one)
      } catch (error) {
        return sendMeetingProblem(reply, error)
      }
    },
  )

  typed.post(
    '/',
    {
      preHandler: requireUser,
      schema: { body: createMeetingBody, response: { 201: meetingOccurrence } },
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
      schema: { params: idParams, body: updateMeetingBody, response: { 200: meetingOccurrence } },
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
    { preHandler: requireUser, schema: { params: idParams, querystring: deleteMeetingQuery } },
    async (req, reply) => {
      try {
        await app.db.transaction((tx) =>
          cancelMeeting(tx, authedUser(req).workspaceId, req.params.id, req.query),
        )
        return reply.code(204).send()
      } catch (error) {
        return sendMeetingProblem(reply, error)
      }
    },
  )
}
