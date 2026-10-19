import { api } from '@ctws/contracts'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { on, serve } from '../../platform/http/serve'
import { actorOf, currentUser, todayOf } from '../../shell/auth'
import { birthdayEntries, listBirthdays, previewBirthday } from './birthdays'
import { toPersonResponse } from './mapper'
import { getPerson, listPeople, searchPeople } from './queries'
import { createPerson, replaceRoles, softDeletePerson, updatePerson } from './service'

export const personRoutes: FastifyPluginAsyncZod = async (app) => {
  serve(app, [
    on(api.people.list, async (req) => {
      const { rows, page } = await listPeople(app.db, currentUser(req).workspaceId, req.query)
      return { people: rows.map((p) => toPersonResponse(p, todayOf(req))), page }
    }),

    on(api.people.birthdays, async (req) =>
      listBirthdays(app.db, currentUser(req).workspaceId, todayOf(req)),
    ),

    on(api.people.calendar, async (req) => ({
      entries: await birthdayEntries(app.db, currentUser(req).workspaceId, req.query),
    })),

    on(api.people.birthdayPreview, async (req) => {
      const { calendar, year, month, day, leap, hour } = req.query
      return previewBirthday(
        { calendar, year: year ?? null, month, day, leapMonth: leap === 'true' },
        hour ?? null,
        todayOf(req),
      )
    }),

    on(api.people.search, async (req) => {
      const { rows, page } = await searchPeople(
        app.db,
        currentUser(req).workspaceId,
        req.query.q,
        req.query,
      )
      return { people: rows.map((p) => toPersonResponse(p, todayOf(req))), page }
    }),

    on(api.people.get, async (req) => {
      const row = await getPerson(app.db, currentUser(req).workspaceId, req.params.id)
      return toPersonResponse(row, todayOf(req))
    }),

    on(api.people.create, async (req) => {
      const created = await createPerson(app.db, actorOf(req), req.body)
      return toPersonResponse(created, todayOf(req))
    }),

    on(api.people.update, async (req) => {
      const updated = await updatePerson(app.db, actorOf(req), req.params.id, req.body)
      return toPersonResponse(updated, todayOf(req))
    }),

    on(api.people.remove, async (req) => {
      await softDeletePerson(app.db, actorOf(req), req.params.id)
    }),

    on(api.people.putRoles, async (req) => {
      const updated = await replaceRoles(app.db, actorOf(req), req.params.id, req.body.roles)
      return toPersonResponse(updated, todayOf(req))
    }),
  ])
}
