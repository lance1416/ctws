import { api } from '@ctws/contracts'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { on, serve } from '../../platform/http/serve'
import { actorOf, currentUser, todayOf } from '../../shell/auth'
import {
  bytesOf,
  keepPhoto,
  PHOTO_BODY,
  putBackPhoto,
  storeOf,
  takeOffPhoto,
} from '../../shell/files'
import type { LinkRegistry } from '../../shell/links'
import { NotFound } from '../../platform/errors'
import { birthdayEntries, listBirthdays, previewBirthday } from './birthdays'
import { listCircles, putCircles } from './circles'
import { toPersonResponse } from './mapper'
import { getPerson, listPeople, searchPeople } from './queries'
import { personHolder } from './photo'
import { createPerson, replaceRoles, deletePerson, updatePerson } from './service'
import { peopleInTouch } from './touch'

export const personRoutes: FastifyPluginAsyncZod<{ registry: LinkRegistry }> = async (
  app,
  { registry },
) => {
  serve(app, [
    on(api.people.touch, async (req) => {
      const user = currentUser(req)
      return peopleInTouch(registry, app.db, user.workspaceId, app.clock(), user.timezone)
    }),

    on(api.people.list, async (req) => {
      const { rows, page } = await listPeople(app.db, currentUser(req).workspaceId, req.query)
      return { people: rows.map((p) => toPersonResponse(p, todayOf(req))), page }
    }),

    on(api.people.birthdays, async (req) => {
      const user = currentUser(req)
      return listBirthdays(app.db, user.workspaceId, app.clock(), user.timezone)
    }),

    on(api.people.circles, async (req) => ({
      circles: await listCircles(app.db, currentUser(req).workspaceId),
    })),

    on(api.people.putCircles, async (req) => ({
      circles: await app.db.transaction((tx) => putCircles(tx, actorOf(req), req.body)),
    })),

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
      await deletePerson(app.db, actorOf(req), req.params.id)
    }),

    on(
      api.people.setPhoto,
      async (req) => {
        const ctx = actorOf(req)
        const holder = personHolder(ctx.workspaceId, req.params.id)
        const avatarId = await keepPhoto(
          app.db,
          storeOf(app),
          ctx,
          holder,
          bytesOf(req.body),
          req.query,
        )
        return { avatarId }
      },
      PHOTO_BODY,
    ),

    on(api.people.removePhoto, async (req) => {
      storeOf(app)
      const ctx = actorOf(req)
      const token = await takeOffPhoto(app.db, ctx, personHolder(ctx.workspaceId, req.params.id))
      if (!token) throw new NotFound('Photo')
      return { undoToken: token }
    }),

    on(api.people.restorePhoto, async (req) => {
      storeOf(app)
      const ctx = actorOf(req)
      const holder = personHolder(ctx.workspaceId, req.params.id)
      return { avatarId: await putBackPhoto(app.db, ctx, holder, req.body.undoToken) }
    }),

    on(api.people.putRoles, async (req) => {
      const updated = await replaceRoles(app.db, actorOf(req), req.params.id, req.body.roles)
      return toPersonResponse(updated, todayOf(req))
    }),
  ])
}
