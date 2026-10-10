import {
  birthdayPreviewQuery,
  birthdayPreviewResponse,
  birthdayResponse,
  birthdaysResponse,
  calendarEntriesResponse,
  calendarQuery,
  contactListQuery,
  contactResponse,
  createContactBody,
  searchQuery,
  updateContactBody,
} from '@ctws/contracts'
import type { FastifyPluginAsync, FastifyReply } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { factsOf, keptNote, nextOccurrence, type Birthday } from '@ctws/core'
import { authedUser, requireUser } from '../auth/require-user'
import { accountToday } from '../db/today'
import { sendProblem } from '../problem'
import { ProjectNotFoundError } from '../projects/errors'
import { listBirthdayEntries, listBirthdays } from './birthdays'
import { ContactNotFoundError } from './errors'
import {
  createContact,
  listContacts,
  searchContacts,
  softDeleteContact,
  updateContact,
  type ContactRow,
  type StoredBirthday,
} from './store'

/** THE THIRD MODULE's API, under its own namespace at `/api/v1/contacts/`. */

function toResponse(c: ContactRow, today: string): z.infer<typeof contactResponse> {
  return {
    id: c.id,
    name: c.name,
    org: c.org,
    note: c.note,
    projects: c.projects,
    channels: c.channels,
    birthday: c.birthday ? withFacts(c.birthday, today) : null,
    gender: c.gender as z.infer<typeof contactResponse>['gender'],
    hometown: c.hometown,
    city: c.city,
    title: c.title,
    circle: c.circle as z.infer<typeof contactResponse>['circle'],
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }
}

/**
 * The derived half, worked out together (`@ctws/core`): the other calendar, the zodiac, the sign,
 * the hour, and when it next comes round. None of it is stored -- a stored zodiac is a second
 * place for the birth date to be wrong.
 */
function withFacts(b: StoredBirthday, today: string): z.infer<typeof birthdayResponse> {
  const birthday: Birthday = {
    calendar: b.calendar,
    year: b.year,
    month: b.month,
    day: b.day,
    leapMonth: b.leapMonth,
  }
  const next = nextOccurrence(birthday, today)
  return {
    ...b,
    ...factsOf(birthday, b.hourBranch),
    next: { ...next, keptNote: keptNote(birthday, next) },
  }
}

const idParams = z.object({ id: z.uuid() }).strict()
const listResponse = z.object({ contacts: z.array(contactResponse) }).strict()

function sendContactProblem(reply: FastifyReply, error: unknown): void {
  // A project from another workspace reads as "not found" too, never as a refusal that would
  // confirm the id exists.
  if (error instanceof ContactNotFoundError) return sendProblem(reply, 404, 'Not Found')
  if (error instanceof ProjectNotFoundError) return sendProblem(reply, 404, 'Not Found')
  throw error
}

export const contactRoutes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<ZodTypeProvider>()

  typed.get(
    '/',
    {
      preHandler: requireUser,
      schema: { querystring: contactListQuery, response: { 200: listResponse } },
    },
    async (req) => {
      const user = authedUser(req)
      // One ask per request: every birthday's countdown is measured from the same day.
      const today = await accountToday(app.db, user.timezone)
      const { projectId, unfiled } = req.query
      const rows = await listContacts(app.db, authedUser(req).workspaceId, {
        ...(projectId ? { projectId } : {}),
        ...(unfiled === 'true' ? { unfiled: true } : {}),
      })
      return { contacts: rows.map((c) => toResponse(c, today)) }
    },
  )

  /**
   * THE BIRTHDAYS PAGE. A lens: it owns nothing, so there is only a read here.
   *
   * Written before `/:id` so a reader does not have to know that Fastify ranks a static segment
   * above a parameter one.
   */
  typed.get(
    '/birthdays',
    { preHandler: requireUser, schema: { response: { 200: birthdaysResponse } } },
    async (req) => {
      const user = authedUser(req)
      return listBirthdays(app.db, user.workspaceId, user.timezone)
    },
  )

  /** This module's dated things, for the shell's calendar. A birthday has no time of day. */
  typed.get(
    '/calendar',
    {
      preHandler: requireUser,
      schema: { querystring: calendarQuery, response: { 200: calendarEntriesResponse } },
    },
    async (req) => ({
      entries: await listBirthdayEntries(
        app.db,
        authedUser(req).workspaceId,
        req.query.from,
        req.query.to,
      ),
    }),
  )

  /** What a birthday WOULD mean, before it is saved. The rules have one implementation. */
  typed.get(
    '/birthdays/preview',
    {
      preHandler: requireUser,
      schema: { querystring: birthdayPreviewQuery, response: { 200: birthdayPreviewResponse } },
    },
    async (req) => {
      const user = authedUser(req)
      const today = await accountToday(app.db, user.timezone)
      const birthday: Birthday = {
        calendar: req.query.calendar,
        year: req.query.year ?? null,
        month: req.query.month,
        day: req.query.day,
        leapMonth: req.query.leap === 'true',
      }
      const next = nextOccurrence(birthday, today)
      return {
        ...factsOf(birthday, req.query.hour ?? null),
        next: { ...next, keptNote: keptNote(birthday, next) },
      }
    },
  )

  typed.get(
    '/search',
    {
      preHandler: requireUser,
      schema: {
        querystring: searchQuery,
        response: { 200: listResponse },
      },
    },
    async (req) => {
      const user = authedUser(req)
      const today = await accountToday(app.db, user.timezone)
      const rows = await searchContacts(app.db, user.workspaceId, req.query.q)
      return { contacts: rows.map((c) => toResponse(c, today)) }
    },
  )

  typed.post(
    '/',
    {
      preHandler: requireUser,
      schema: { body: createContactBody, response: { 201: contactResponse } },
    },
    async (req, reply) => {
      try {
        // One transaction: a contact and its addresses are one thing, and a half-written person
        // with no way to reach them is worse than a refusal.
        const created = await app.db.transaction((tx) =>
          createContact(tx, authedUser(req).workspaceId, req.body),
        )
        const today = await accountToday(app.db, authedUser(req).timezone)
        return reply.code(201).send(toResponse(created, today))
      } catch (error) {
        return sendContactProblem(reply, error)
      }
    },
  )

  typed.patch(
    '/:id',
    {
      preHandler: requireUser,
      schema: { params: idParams, body: updateContactBody, response: { 200: contactResponse } },
    },
    async (req, reply) => {
      try {
        const updated = await app.db.transaction((tx) =>
          updateContact(tx, authedUser(req).workspaceId, req.params.id, req.body),
        )
        const today = await accountToday(app.db, authedUser(req).timezone)
        return toResponse(updated, today)
      } catch (error) {
        return sendContactProblem(reply, error)
      }
    },
  )

  typed.delete(
    '/:id',
    { preHandler: requireUser, schema: { params: idParams } },
    async (req, reply) => {
      try {
        await softDeleteContact(app.db, authedUser(req).workspaceId, req.params.id)
        return reply.code(204).send()
      } catch (error) {
        return sendContactProblem(reply, error)
      }
    },
  )
}
