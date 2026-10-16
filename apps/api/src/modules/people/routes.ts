import {
  birthdayPreviewQuery,
  birthdayPreviewResponse,
  birthdaysResponse,
  calendarEntriesResponse,
  calendarQuery,
  createPersonBody,
  idParams,
  peopleResponse,
  personResponse,
  searchQuery,
  updatePersonBody,
} from '@ctws/contracts'
import type { FastifyRequest } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { accountToday } from '../../platform/db/time'
import { currentUser } from '../../shell/auth/authenticated'
import { birthdayEntries, listBirthdays, previewBirthday } from './birthdays'
import { toPersonResponse } from './mapper'
import { listPeople, searchPeople } from './queries'
import { createPerson, softDeletePerson, updatePerson } from './service'

export const personRoutes: FastifyPluginAsyncZod = async (app) => {
  /** The account's today, asked once per request so every countdown shares it. */
  const todayFor = (req: FastifyRequest) =>
    accountToday(app.db, currentUser(req).timezone, app.clock())

  app.get('/', { schema: { response: { 200: peopleResponse } } }, async (req) => {
    const rows = await listPeople(app.db, currentUser(req).workspaceId)
    const today = await todayFor(req)
    return { people: rows.map((p) => toPersonResponse(p, today)) }
  })

  app.get('/birthdays', { schema: { response: { 200: birthdaysResponse } } }, async (req) => {
    const user = currentUser(req)
    return listBirthdays(app.db, user.workspaceId, user.timezone, app.clock())
  })

  app.get(
    '/calendar',
    { schema: { querystring: calendarQuery, response: { 200: calendarEntriesResponse } } },
    async (req) => ({
      entries: await birthdayEntries(app.db, currentUser(req).workspaceId, req.query),
    }),
  )

  app.get(
    '/birthdays/preview',
    { schema: { querystring: birthdayPreviewQuery, response: { 200: birthdayPreviewResponse } } },
    async (req) => {
      const { calendar, year, month, day, leap, hour } = req.query
      return previewBirthday(
        { calendar, year: year ?? null, month, day, leapMonth: leap === 'true' },
        hour ?? null,
        await todayFor(req),
      )
    },
  )

  app.get(
    '/search',
    { schema: { querystring: searchQuery, response: { 200: peopleResponse } } },
    async (req) => {
      const rows = await searchPeople(app.db, currentUser(req).workspaceId, req.query.q)
      const today = await todayFor(req)
      return { people: rows.map((p) => toPersonResponse(p, today)) }
    },
  )

  app.post(
    '/',
    { schema: { body: createPersonBody, response: { 201: personResponse } } },
    async (req, reply) => {
      const created = await createPerson(app.db, currentUser(req).workspaceId, req.body)
      return reply.code(201).send(toPersonResponse(created, await todayFor(req)))
    },
  )

  app.patch(
    '/:id',
    { schema: { params: idParams, body: updatePersonBody, response: { 200: personResponse } } },
    async (req) => {
      const updated = await updatePerson(
        app.db,
        currentUser(req).workspaceId,
        req.params.id,
        req.body,
      )
      return toPersonResponse(updated, await todayFor(req))
    },
  )

  app.delete('/:id', { schema: { params: idParams } }, async (req, reply) => {
    await softDeletePerson(app.db, currentUser(req).workspaceId, req.params.id)
    return reply.code(204).send()
  })
}
