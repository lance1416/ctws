import { api } from '@ctws/contracts'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { DomainError, NotFound } from '../../platform/errors'
import { on, serve } from '../../platform/http/serve'
import { actorOf, currentUser } from '../auth/authenticated'
import { exists } from '../links/read'
import type { LinkRegistry } from '../links/registry'
import { relationsOf } from './read'
import {
  addRelation,
  getRelation,
  MentionIsReadOnly,
  noteRelation,
  removeRelation,
  toRelationResponse,
} from './store'

/** Relations join two modules' things, so the shell owns them; each module only names its own. */
export const relationRoutes: FastifyPluginAsyncZod<{ registry: LinkRegistry }> = async (
  app,
  { registry },
) => {
  const readOnly = (e: unknown) => {
    if (e instanceof MentionIsReadOnly) throw new DomainError('conflict', { detail: e.message })
    throw e
  }
  serve(app, [
    on(api.relations.of, async (req) => {
      const { workspaceId } = currentUser(req)
      const { types, ...of } = req.query
      // A foreign or deleted thing is a 404, not an empty page.
      if (!(await exists(registry, app.db, workspaceId, of))) throw new NotFound('Object')
      return relationsOf(registry, app.db, workspaceId, of, types)
    }),

    on(api.relations.get, async (req) =>
      toRelationResponse(await getRelation(app.db, currentUser(req).workspaceId, req.params.id)),
    ),

    on(api.relations.create, async (req, reply) => {
      const ctx = actorOf(req)
      const { from, to, note } = req.body
      const { relation, created } = await app.db.transaction(async (tx) => {
        if (!(await exists(registry, tx, ctx.workspaceId, from))) throw new NotFound('Object')
        if (!(await exists(registry, tx, ctx.workspaceId, to))) throw new NotFound('Object')
        return addRelation(tx, ctx, { from, to, note })
      })
      if (!created) reply.code(200)
      return toRelationResponse(relation)
    }),

    on(api.relations.update, async (req) =>
      toRelationResponse(
        await app.db
          .transaction((tx) => noteRelation(tx, actorOf(req), req.params.id, req.body.note))
          .catch(readOnly),
      ),
    ),

    on(api.relations.remove, async (req) => {
      await app.db
        .transaction((tx) => removeRelation(tx, actorOf(req), req.params.id))
        .catch(readOnly)
    }),
  ])
}
