import {
  birthdayPreviewQuery,
  birthdayPreviewResponse,
  birthdayResponse,
  type BirthdayInput,
  birthdaysResponse,
  calendarEntriesResponse,
  calendarQuery,
  personListQuery,
  personResponse,
  createPersonBody,
  searchQuery,
  updatePersonBody,
} from '@ctws/contracts'
import type { FastifyPluginAsync, FastifyReply } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { birthdayProblem, factsOf, keptNote, nextOccurrence, type Birthday } from '@ctws/core'
import { authedUser, requireUser } from '../auth/require-user'
import { accountToday } from '../db/today'
import { sendProblem } from '../problem'
import { ProjectNotFoundError } from '../projects/errors'
import { listBirthdayEntries, listBirthdays } from './birthdays'
import { PersonNotFoundError } from './errors'
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

const idParams = z.object({ id: z.uuid() }).strict()
const listResponse = z.object({ people: z.array(personResponse) }).strict()

/**
 * 历法那道门：没发生过的日子进不来。
 *
 * 字段各自合法，凑起来可以不存在，而那取决于年份——那一年的正月没有三十，那一年不闰六月，平年
 * 没有 2 月 29 日。校验因此不在 contract 里：contract 要跟着界面进浏览器，而只有历法库知道答案，
 * 它有 750 KB。写进去就晚了——派生值在读取时才算，一行坏数据会让列表、搜索、生日页一起 500。
 */
function sendImpossibleDay(reply: FastifyReply, b: BirthdayInput | null | undefined): boolean {
  if (!b) return false
  const problem = birthdayProblem({
    calendar: b.calendar,
    year: b.year ?? null,
    month: b.month,
    day: b.day,
    leapMonth: b.leapMonth,
  })
  if (problem === null) return false
  sendProblem(reply, 400, 'Bad Request', problem)
  return true
}

function sendPersonProblem(reply: FastifyReply, error: unknown): void {
  // A project from another workspace reads as "not found" too, never as a refusal that would
  // confirm the id exists.
  if (error instanceof PersonNotFoundError) return sendProblem(reply, 404, 'Not Found')
  if (error instanceof ProjectNotFoundError) return sendProblem(reply, 404, 'Not Found')
  throw error
}

export const personRoutes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<ZodTypeProvider>()

  typed.get(
    '/',
    {
      preHandler: requireUser,
      schema: { querystring: personListQuery, response: { 200: listResponse } },
    },
    async (req) => {
      const user = authedUser(req)
      // One ask per request: every birthday's countdown is measured from the same day.
      const today = await accountToday(app.db, user.timezone)
      const { projectId, unfiled } = req.query
      const rows = await listPeople(app.db, authedUser(req).workspaceId, {
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
    async (req, reply) => {
      const user = authedUser(req)
      const today = await accountToday(app.db, user.timezone)
      const birthday: Birthday = {
        calendar: req.query.calendar,
        year: req.query.year ?? null,
        month: req.query.month,
        day: req.query.day,
        leapMonth: req.query.leap === 'true',
      }
      const problem = birthdayProblem(birthday)
      if (problem !== null) return sendProblem(reply, 400, 'Bad Request', problem)
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
      const rows = await searchPeople(app.db, user.workspaceId, req.query.q)
      return { people: rows.map((c) => toResponse(c, today)) }
    },
  )

  typed.post(
    '/',
    {
      preHandler: requireUser,
      schema: { body: createPersonBody, response: { 201: personResponse } },
    },
    async (req, reply) => {
      if (sendImpossibleDay(reply, req.body.birthday)) return reply
      try {
        // One transaction: a person and its addresses are one thing, and a half-written person
        // with no way to reach them is worse than a refusal.
        const created = await app.db.transaction((tx) =>
          createPerson(tx, authedUser(req).workspaceId, req.body),
        )
        const today = await accountToday(app.db, authedUser(req).timezone)
        return reply.code(201).send(toResponse(created, today))
      } catch (error) {
        return sendPersonProblem(reply, error)
      }
    },
  )

  typed.patch(
    '/:id',
    {
      preHandler: requireUser,
      schema: { params: idParams, body: updatePersonBody, response: { 200: personResponse } },
    },
    async (req, reply) => {
      if (sendImpossibleDay(reply, req.body.birthday)) return reply
      try {
        const updated = await app.db.transaction((tx) =>
          updatePerson(tx, authedUser(req).workspaceId, req.params.id, req.body),
        )
        const today = await accountToday(app.db, authedUser(req).timezone)
        return toResponse(updated, today)
      } catch (error) {
        return sendPersonProblem(reply, error)
      }
    },
  )

  typed.delete(
    '/:id',
    { preHandler: requireUser, schema: { params: idParams } },
    async (req, reply) => {
      try {
        await softDeletePerson(app.db, authedUser(req).workspaceId, req.params.id)
        return reply.code(204).send()
      } catch (error) {
        return sendPersonProblem(reply, error)
      }
    },
  )
}
