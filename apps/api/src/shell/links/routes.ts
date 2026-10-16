import {
  candidatesQuery,
  candidatesResponse,
  createLinkBody,
  createLinkResponse,
  linkParams,
  linkQuery,
  linksResponse,
} from '@ctws/contracts'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { actorOf, currentUser } from '../auth/authenticated'
import { candidatesFor, exists, linksOf } from './read'
import type { LinkRegistry } from './registry'
import { linkObjects } from './service'
import { removeLink } from './store'
import { NotFound } from '../../platform/errors'

/** Candidates per type, so a box full of tasks still shows people. */
const CANDIDATES_PER_TYPE = 8

/** Edges join two modules' objects, so the shell owns them; each module only names its own. */
export const linkRoutes: FastifyPluginAsyncZod<{ registry: LinkRegistry }> = async (
  app,
  { registry },
) => {
  app.get(
    '/links/:type/:id',
    { schema: { params: linkParams, response: { 200: linksResponse } } },
    async (req) => {
      const { workspaceId } = currentUser(req)
      const of = req.params
      // A foreign or deleted object is a 404, not an empty page.
      if (!(await exists(registry, app.db, workspaceId, of))) throw new NotFound('Object')
      return linksOf(registry, app.db, workspaceId, of)
    },
  )

  app.get(
    '/links/candidates',
    { schema: { querystring: candidatesQuery, response: { 200: candidatesResponse } } },
    async (req) => {
      const { workspaceId } = currentUser(req)
      const of = { type: req.query.type, id: req.query.id }
      if (!(await exists(registry, app.db, workspaceId, of))) throw new NotFound('Object')
      const candidates = await candidatesFor(
        registry,
        app.db,
        workspaceId,
        of,
        req.query.q ?? '',
        CANDIDATES_PER_TYPE,
      )
      return { candidates }
    },
  )

  app.post(
    '/links',
    { schema: { body: createLinkBody, response: { 201: createLinkResponse } } },
    async (req, reply) => {
      await linkObjects(registry, app.db, { ...actorOf(req), ...req.body })
      // 201 whether or not the edge was already there.
      reply.code(201)
      return { created: true }
    },
  )

  app.delete('/links', { schema: { querystring: linkQuery } }, async (req, reply) => {
    const { workspaceId } = currentUser(req)
    const { fromType, fromId, toType, toId, kind } = req.query
    // Not checked against the model: a link stored before the model refused its kind must still
    // be removable.
    await removeLink(app.db, {
      workspaceId,
      from: { type: fromType, id: fromId },
      to: { type: toType, id: toId },
      kind,
    })
    return reply.code(204).send()
  })
}
