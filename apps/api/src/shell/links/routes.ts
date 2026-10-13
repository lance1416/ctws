import {
  candidatesQuery,
  candidatesResponse,
  createLinkBody,
  linkIsAllowed,
  linkParams,
  linkQuery,
  linksResponse,
} from '@ctws/contracts'
import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { authedUser, requireUser } from '../auth/require-user'
import { LinkEndNotFoundError, UnknownLinkError } from './errors'
import { candidatesFor, exists, linksOf } from './read'
import { addLink, removeLink } from './store'

/**
 * EDGES -- THE SHELL's API, flat at `/api/v1/links`, beside projects.
 *
 * Not a module's: an edge joins two modules' things, so no module could own it without learning
 * about another. What each module owns is the NAME of its own things, which it hands over through
 * `links/linkable.ts`.
 */
export const linkRoutes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<ZodTypeProvider>()

  typed.get(
    '/links/:type/:id',
    {
      preHandler: requireUser,
      schema: { params: linkParams, response: { 200: linksResponse } },
    },
    async (req) => {
      const { workspaceId } = authedUser(req)
      const of = req.params
      // A page of something that is gone is a 404, not an empty page: an id from another
      // workspace must read the same as one that never existed.
      if (!(await exists(app.db, workspaceId, of))) throw new LinkEndNotFoundError()
      return linksOf(app.db, workspaceId, of)
    },
  )

  /**
   * WHAT COULD GO AT THE OTHER END, while the picker is being typed into.
   *
   * Only the types the model allows to be joined to this one, and never the object itself. The
   * shell merges the answers; each module searches its own table, which is the same split as
   * naming an edge's far end and the reason one box can offer four kinds of thing at once.
   */
  typed.get(
    '/links/candidates',
    {
      preHandler: requireUser,
      schema: { querystring: candidatesQuery, response: { 200: candidatesResponse } },
    },
    async (req) => {
      const { workspaceId } = authedUser(req)
      const of = { type: req.query.type, id: req.query.id }
      if (!(await exists(app.db, workspaceId, of))) throw new LinkEndNotFoundError()
      // PER TYPE, not in total: a box that filled with twenty tasks and showed no people would
      // look like there are no people.
      const candidates = await candidatesFor(app.db, workspaceId, of, req.query.q ?? '', 8)
      return { candidates }
    },
  )

  typed.post(
    '/links',
    {
      preHandler: requireUser,
      schema: {
        body: createLinkBody,
        response: { 201: z.object({ created: z.boolean() }).strict() },
      },
    },
    async (req, reply) => {
      const { workspaceId } = authedUser(req)
      const { from, to, kind } = req.body
      // BOTH ends, and in this workspace. The edge table has no foreign key to either -- there is
      // no one table to point at -- so this is the check that stands in for one.
      const [hasFrom, hasTo] = await Promise.all([
        exists(app.db, workspaceId, from),
        exists(app.db, workspaceId, to),
      ])
      if (!hasFrom || !hasTo) throw new LinkEndNotFoundError()
      await addLink(app.db, workspaceId, from, to, kind)
      reply.code(201)
      // Making an edge that is already there is the same fact twice, and answering 201 either way
      // is what lets a client stop caring which it was.
      return { created: true }
    },
  )

  typed.delete(
    '/links',
    {
      preHandler: requireUser,
      schema: { querystring: linkQuery },
    },
    async (req, reply) => {
      const { workspaceId } = authedUser(req)
      const { fromType, fromId, toType, toId, kind } = req.query
      // A tuple the model never allowed cannot name a stored edge, so it is a bad request rather
      // than a 204, which would read as though something had been deleted.
      if (!linkIsAllowed(kind, fromType, toType)) throw new UnknownLinkError()
      await removeLink(
        app.db,
        workspaceId,
        { type: fromType, id: fromId },
        { type: toType, id: toId },
        kind,
      )
      // 204 whether or not a row was there: removing an edge that is already gone is the state
      // the caller asked for.
      return reply.code(204).send()
    },
  )
}
