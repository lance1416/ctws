import {
  calendarEntriesResponse,
  calendarQuery,
  createMeetingBody,
  DAY_MS,
  deleteMeetingQuery,
  idParams,
  meetingListQuery,
  meetingOccurrence,
  meetingsResponse,
  occurrenceQuery,
  updateMeetingBody,
} from '@ctws/contracts'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { currentUser } from '../../shell/auth/authenticated'
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
    to: new Date(instantOf(`${to}T00:00`, timezone).getTime() + DAY_MS),
  }
}

/** "EST" / "BST": the zone's own short name at that moment, which is what a person says. */
export function zoneLabel(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'short',
  }).formatToParts(at)
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? timeZone
}

export const meetingRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/',
    {
      schema: { querystring: meetingListQuery, response: { 200: meetingsResponse } },
    },
    async (req) => {
      const user = currentUser(req)
      // A list with no window means the month ahead: a recurring meeting has no last occurrence,
      // so "everything" is not an answer anyone can be given.
      const now = app.clock()
      const from = req.query.from ?? localOf(now, user.timezone).slice(0, 10)
      const to =
        req.query.to ?? localOf(new Date(now.getTime() + 31 * DAY_MS), user.timezone).slice(0, 10)
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
  app.get(
    '/calendar',
    {
      schema: {
        querystring: calendarQuery,
        response: { 200: calendarEntriesResponse },
      },
    },
    async (req) => {
      const user = currentUser(req)
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

  app.get(
    '/:id',
    {
      schema: {
        params: idParams,
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
      return toResponse(one)
    },
  )

  app.post(
    '/',
    {
      schema: { body: createMeetingBody, response: { 201: meetingOccurrence } },
    },
    async (req, reply) => {
      // One transaction: a meeting and who is in it are one thing to arrange.
      const created = await app.db.transaction((tx) =>
        createMeeting(tx, currentUser(req).workspaceId, req.body),
      )
      return reply.code(201).send(toResponse(created))
    },
  )

  app.patch(
    '/:id',
    {
      schema: { params: idParams, body: updateMeetingBody, response: { 200: meetingOccurrence } },
    },
    async (req) => {
      const updated = await app.db.transaction((tx) =>
        updateMeeting(tx, currentUser(req).workspaceId, req.params.id, req.body),
      )
      return toResponse(updated)
    },
  )

  app.delete(
    '/:id',
    { schema: { params: idParams, querystring: deleteMeetingQuery } },
    async (req, reply) => {
      await app.db.transaction((tx) =>
        cancelMeeting(tx, currentUser(req).workspaceId, req.params.id, req.query),
      )
      return reply.code(204).send()
    },
  )
}
