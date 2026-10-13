import {
  candidatesQuery,
  candidatesResponse,
  createLinkBody,
  createLinkResponse,
  linkIsAllowed,
  linkParams,
  linkQuery,
  linksResponse,
} from '@ctws/contracts'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { currentUser } from '../auth/authenticated'
import { LinkEndNotFoundError, UnknownLinkError } from './errors'
import { candidatesFor, exists, linksOf } from './read'
import type { LinkRegistry } from './registry'
import { addLink, removeLink } from './store'

/**
 * EDGES -- THE SHELL's API, flat at `/api/v1/links`, beside projects.
 *
 * Not a module's: an edge joins two modules' things, so no module could own it without learning
 * about another. What each module owns is the NAME of its own things, which it hands over through
 * `links/linkable.ts`.
 */
export const linkRoutes: FastifyPluginAsyncZod<{ registry: LinkRegistry }> = async (
  app,
  { registry },
) => {
  app.get(
    '/links/:type/:id',
    {
      schema: { params: linkParams, response: { 200: linksResponse } },
    },
    async (req) => {
      const { workspaceId } = currentUser(req)
      const of = req.params
      // A page of something that is gone is a 404, not an empty page: an id from another
      // workspace must read the same as one that never existed.
      if (!(await exists(registry, app.db, workspaceId, of))) throw new LinkEndNotFoundError()
      return linksOf(registry, app.db, workspaceId, of)
    },
  )

  /**
   * WHAT COULD GO AT THE OTHER END, while the picker is being typed into.
   *
   * Only the types the model allows to be joined to this one, and never the object itself. The
   * shell merges the answers; each module searches its own table, which is the same split as
   * naming an edge's far end and the reason one box can offer four kinds of thing at once.
   */
  app.get(
    '/links/candidates',
    {
      schema: { querystring: candidatesQuery, response: { 200: candidatesResponse } },
    },
    async (req) => {
      const { workspaceId } = currentUser(req)
      const of = { type: req.query.type, id: req.query.id }
      if (!(await exists(registry, app.db, workspaceId, of))) throw new LinkEndNotFoundError()
      // PER TYPE, not in total: a box that filled with twenty tasks and showed no people would
      // look like there are no people.
      const candidates = await candidatesFor(
        registry,
        app.db,
        workspaceId,
        of,
        req.query.q ?? '',
        8,
      )
      return { candidates }
    },
  )

  app.post(
    '/links',
    {
      schema: {
        body: createLinkBody,
        response: { 201: createLinkResponse },
      },
    },
    async (req, reply) => {
      const { workspaceId } = currentUser(req)
      const { from, to, kind } = req.body
      // BOTH ends, and in this workspace. The edge table has no foreign key to either -- there is
      // no one table to point at -- so this is the check that stands in for one.
      const [hasFrom, hasTo] = await Promise.all([
        exists(registry, app.db, workspaceId, from),
        exists(registry, app.db, workspaceId, to),
      ])
      if (!hasFrom || !hasTo) throw new LinkEndNotFoundError()
      await addLink(app.db, workspaceId, from, to, kind)
      reply.code(201)
      // Making an edge that is already there is the same fact twice, and answering 201 either way
      // is what lets a client stop caring which it was.
      return { created: true }
    },
  )

  app.delete(
    '/links',
    {
      schema: { querystring: linkQuery },
    },
    async (req, reply) => {
      const { workspaceId } = currentUser(req)
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
