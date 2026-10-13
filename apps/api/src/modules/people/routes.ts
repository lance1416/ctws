import {
  type BirthdayInput,
  birthdayPreviewQuery,
  birthdayPreviewResponse,
  birthdayResponse,
  birthdaysResponse,
  calendarEntriesResponse,
  calendarQuery,
  createPersonBody,
  idParams,
  peopleResponse,
  personListQuery,
  personResponse,
  searchQuery,
  updatePersonBody,
} from '@ctws/contracts'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { birthdayProblem, factsOf, keptNote, nextOccurrence, type Birthday } from '@ctws/core'
import { currentUser } from '../../shell/auth/authenticated'
import { accountToday } from '../../platform/db/time'
import { listBirthdayEntries, listBirthdays } from './birthdays'
import { ImpossibleBirthdayError } from './errors'
import {
  createPerson,
  listPeople,
  searchPeople,
  softDeletePerson,
  updatePerson,
  type PersonRow,
  type StoredBirthday,
} from './store'

/** THE THIRD MODULE's API, under its own namespace at `/api/v1/people/`. */

function toResponse(c: PersonRow, today: string): z.infer<typeof personResponse> {
  return {
    id: c.id,
    name: c.name,
    org: c.org,
    note: c.note,
    projects: c.projects,
    channels: c.channels,
    birthday: c.birthday ? withFacts(c.birthday, today) : null,
    gender: c.gender as z.infer<typeof personResponse>['gender'],
    hometown: c.hometown,
    city: c.city,
    title: c.title,
    circle: c.circle as z.infer<typeof personResponse>['circle'],
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

/**
 * Refuses a birthday on a day that never happens in its year (no 30th of that lunar month, no
 * leap month that year). Only the calendar library knows, so the check is here, not in the
 * contract.
 */
function assertPossibleBirthday(b: BirthdayInput | null | undefined): void {
  if (!b) return
  const problem = birthdayProblem({
    calendar: b.calendar,
    year: b.year ?? null,
    month: b.month,
    day: b.day,
    leapMonth: b.leapMonth,
  })
  if (problem !== null) throw new ImpossibleBirthdayError(problem)
}

export const personRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/',
    {
      schema: { querystring: personListQuery, response: { 200: peopleResponse } },
    },
    async (req) => {
      const user = currentUser(req)
      // One ask per request: every birthday's countdown is measured from the same day.
      const today = await accountToday(app.db, user.timezone, app.clock())
      const { projectId, unfiled } = req.query
      const rows = await listPeople(app.db, currentUser(req).workspaceId, {
        ...(projectId ? { projectId } : {}),
        ...(unfiled === 'true' ? { unfiled: true } : {}),
      })
      return { people: rows.map((c) => toResponse(c, today)) }
    },
  )

  /**
   * THE BIRTHDAYS PAGE. A lens: it owns nothing, so there is only a read here.
   *
   * Written before `/:id` so a reader does not have to know that Fastify ranks a static segment
   * above a parameter one.
   */
  app.get('/birthdays', { schema: { response: { 200: birthdaysResponse } } }, async (req) => {
    const user = currentUser(req)
    return listBirthdays(app.db, user.workspaceId, user.timezone, app.clock())
  })

  /** This module's dated things, for the shell's calendar. A birthday has no time of day. */
  app.get(
    '/calendar',
    {
      schema: { querystring: calendarQuery, response: { 200: calendarEntriesResponse } },
    },
    async (req) => ({
      entries: await listBirthdayEntries(
        app.db,
        currentUser(req).workspaceId,
        req.query.from,
        req.query.to,
      ),
    }),
  )

  /** What a birthday WOULD mean, before it is saved. The rules have one implementation. */
  app.get(
    '/birthdays/preview',
    {
      schema: { querystring: birthdayPreviewQuery, response: { 200: birthdayPreviewResponse } },
    },
    async (req) => {
      const user = currentUser(req)
      const today = await accountToday(app.db, user.timezone, app.clock())
      const birthday: Birthday = {
        calendar: req.query.calendar,
        year: req.query.year ?? null,
        month: req.query.month,
        day: req.query.day,
        leapMonth: req.query.leap === 'true',
      }
      const problem = birthdayProblem(birthday)
      if (problem !== null) throw new ImpossibleBirthdayError(problem)
      const next = nextOccurrence(birthday, today)
      return {
        ...factsOf(birthday, req.query.hour ?? null),
        next: { ...next, keptNote: keptNote(birthday, next) },
      }
    },
  )

  app.get(
    '/search',
    {
      schema: {
        querystring: searchQuery,
        response: { 200: peopleResponse },
      },
    },
    async (req) => {
      const user = currentUser(req)
      const today = await accountToday(app.db, user.timezone, app.clock())
      const rows = await searchPeople(app.db, user.workspaceId, req.query.q)
      return { people: rows.map((c) => toResponse(c, today)) }
    },
  )

  app.post(
    '/',
    {
      schema: { body: createPersonBody, response: { 201: personResponse } },
    },
    async (req, reply) => {
      assertPossibleBirthday(req.body.birthday)
      // One transaction: a person and its addresses are one thing.
      const created = await app.db.transaction((tx) =>
        createPerson(tx, currentUser(req).workspaceId, req.body),
      )
      const today = await accountToday(app.db, currentUser(req).timezone, app.clock())
      return reply.code(201).send(toResponse(created, today))
    },
  )

  app.patch(
    '/:id',
    {
      schema: { params: idParams, body: updatePersonBody, response: { 200: personResponse } },
    },
    async (req) => {
      assertPossibleBirthday(req.body.birthday)
      const updated = await app.db.transaction((tx) =>
        updatePerson(tx, currentUser(req).workspaceId, req.params.id, req.body),
      )
      const today = await accountToday(app.db, currentUser(req).timezone, app.clock())
      return toResponse(updated, today)
    },
  )

  app.delete('/:id', { schema: { params: idParams } }, async (req, reply) => {
    await softDeletePerson(app.db, currentUser(req).workspaceId, req.params.id)
    return reply.code(204).send()
  })
}
