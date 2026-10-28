import { api } from '@ctws/contracts'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { NotFound } from '../../platform/errors'
import { on, serve } from '../../platform/http/serve'
import { currentUser } from '../auth/authenticated'
import { candidatesFor, exists } from './read'
import { pageOf, spanOf } from '../../platform/db/page'
import { SEARCH_GROUP, type ObjectType } from '@ctws/contracts'
import type { LinkRegistry } from './registry'

/** Candidates per type, so a box full of tasks still shows people. */
const CANDIDATES_PER_TYPE = 8

/** Search's kinds in their fixed order (DES-001 section 4): people first, notes last. */
const SEARCH_ORDER: readonly ObjectType[] = [
  'person',
  'organisation',
  'task',
  'project',
  'meeting',
  'communication',
  'reading',
  'note',
]

/** The search across every module's things, for the picker and Ctrl K; each module names its own. */
export const linkRoutes: FastifyPluginAsyncZod<{ registry: LinkRegistry }> = async (
  app,
  { registry },
) => {
  serve(app, [
    on(api.links.candidates, async (req) => {
      const { workspaceId } = currentUser(req)
      const { type, id } = req.query
      const of = type && id ? { type, id } : null
      if (of && !(await exists(registry, app.db, workspaceId, of))) throw new NotFound('Object')
      const candidates = await candidatesFor(
        registry,
        app.db,
        workspaceId,
        of,
        req.query.q ?? '',
        CANDIDATES_PER_TYPE,
        req.query.kinds,
      )
      return { candidates }
    }),

    // One question for every kind (FR-024): each kind's first few and its total, or one kind's
    // page; the counts and the rows are each module's own reading of the text.
    on(api.search.everything, async (req) => {
      const { workspaceId } = currentUser(req)
      const { q: text, kind } = req.query
      const kinds = SEARCH_ORDER.filter((t) => registry.order.includes(t) && (!kind || t === kind))
      if (kind) {
        const asked = { limit: req.query.limit, cursor: req.query.cursor }
        const { limit, offset } = spanOf(asked)
        const linkable = registry.of(kind)
        const [rows, total] = await Promise.all([
          linkable.rows(app.db, workspaceId, { text, limit, offset }),
          linkable.count(app.db, workspaceId, text),
        ])
        const { rows: items, page } = pageOf(rows, asked)
        return { groups: total > 0 ? [{ type: kind, total, items }] : [], page }
      }
      const groups = await Promise.all(
        kinds.map(async (type) => {
          const linkable = registry.of(type)
          const [items, total] = await Promise.all([
            linkable.rows(app.db, workspaceId, { text, limit: SEARCH_GROUP }),
            linkable.count(app.db, workspaceId, text),
          ])
          return { type, total, items }
        }),
      )
      return { groups: groups.filter((g) => g.total > 0), page: null }
    }),
  ])
}
