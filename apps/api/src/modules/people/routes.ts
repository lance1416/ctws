import { api } from '@ctws/contracts'
import type { FastifyRequest } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { accountToday } from '../../platform/db/time'
import { on, serve } from '../../platform/http/serve'
import { actorOf, currentUser } from '../../shell/auth/authenticated'
import { birthdayEntries, listBirthdays, previewBirthday } from './birthdays'
import { toPersonResponse } from './mapper'
import { getPerson, listPeople, searchPeople } from './queries'
import { createPerson, softDeletePerson, updatePerson } from './service'

export const personRoutes: FastifyPluginAsyncZod = async (app) => {
  /** The account's today, asked once per request so every countdown shares it. */
  const todayFor = (req: FastifyRequest) =>
    accountToday(app.db, currentUser(req).timezone, app.clock())

  serve(app, [
    on(api.people.list, async (req) => {
      const { rows, page } = await listPeople(app.db, currentUser(req).workspaceId, req.query)
      const today = await todayFor(req)
      return { people: rows.map((p) => toPersonResponse(p, today)), page }
    }),

    on(api.people.birthdays, async (req) => {
      const user = currentUser(req)
      return listBirthdays(app.db, user.workspaceId, user.timezone, app.clock())
    }),

    on(api.people.calendar, async (req) => ({
      entries: await birthdayEntries(app.db, currentUser(req).workspaceId, req.query),
    })),

    on(api.people.birthdayPreview, async (req) => {
      const { calendar, year, month, day, leap, hour } = req.query
      return previewBirthday(
        { calendar, year: year ?? null, month, day, leapMonth: leap === 'true' },
        hour ?? null,
        await todayFor(req),
      )
    }),

    on(api.people.search, async (req) => {
      const { rows, page } = await searchPeople(
        app.db,
        currentUser(req).workspaceId,
        req.query.q,
        req.query,
      )
      const today = await todayFor(req)
      return { people: rows.map((p) => toPersonResponse(p, today)), page }
    }),

    on(api.people.get, async (req) => {
      const row = await getPerson(app.db, currentUser(req).workspaceId, req.params.id)
      return toPersonResponse(row, await todayFor(req))
    }),

    on(api.people.create, async (req) => {
      const created = await createPerson(app.db, actorOf(req), req.body)
      return toPersonResponse(created, await todayFor(req))
    }),

    on(api.people.update, async (req) => {
      const updated = await updatePerson(app.db, actorOf(req), req.params.id, req.body)
      return toPersonResponse(updated, await todayFor(req))
    }),

    on(api.people.remove, async (req) => {
      await softDeletePerson(app.db, actorOf(req), req.params.id)
    }),
  ])
}
