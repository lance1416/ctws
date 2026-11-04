import {
  api,
  UNLINKED_LISTED,
  type LinkCandidate,
  type ObjectType,
  type WorkspaceId,
} from '@ctws/contracts'
import { linkUnlinked, unlinkedIn, type Unlinked } from '@ctws/core'
import { and, eq } from 'drizzle-orm'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { Queryable } from '../../platform/db/client'
import { DomainError, NotFound } from '../../platform/errors'
import { on, serve } from '../../platform/http/serve'
import { actorOf, currentUser } from '../auth/authenticated'
import type { LinkRegistry } from '../links/registry'
import type { TextSource } from '../module'
import { unlinkedDismissed } from './tables'

type Target = { type: ObjectType; id: string }
type Found = Unlinked & { source: Target }

/** The text changed since the place was read: its sentence or its name is not there now. */
class PlaceMovedError extends DomainError {
  constructor() {
    super('conflict', {
      type: 'urn:ctws:problem:unlinked-place-moved',
      title: 'That text has changed since it was read.',
    })
  }
}

/** The thing's title and its other names, or null when the workspace does not see it. */
async function namesOf(
  registry: LinkRegistry,
  q: Queryable,
  workspaceId: WorkspaceId,
  target: Target,
): Promise<string[] | null> {
  const linkable = registry.of(target.type)
  const [thing] = await linkable.rows(q, workspaceId, { ids: [target.id], limit: 1 })
  if (!thing) return null
  const others = (await linkable.otherNames?.(q, workspaceId, target.id)) ?? []
  return [thing.title, ...others]
}

/**
 * Where a person, project or organisation is named in other things' text without an @: the
 * sources asked for any of its names, each sentence then read for them, and what was let be
 * ("Not this one") left out. The thing's own text is not looked in.
 */
async function findUnlinked(
  registry: LinkRegistry,
  sources: readonly TextSource[],
  q: Queryable,
  workspaceId: WorkspaceId,
  target: Target,
): Promise<Found[] | null> {
  const names = await namesOf(registry, q, workspaceId, target)
  if (!names) return null
  const dismissed = await q
    .select()
    .from(unlinkedDismissed)
    .where(
      and(
        eq(unlinkedDismissed.workspaceId, workspaceId),
        eq(unlinkedDismissed.targetType, target.type),
        eq(unlinkedDismissed.targetId, target.id),
      ),
    )
  const letBe = new Set(dismissed.map((d) => `${d.sourceType}:${d.sourceId}:${d.excerpt}`))
  const found: Found[] = []
  for (const source of sources) {
    for (const row of await source.find(q, workspaceId, names)) {
      if (source.type === target.type && row.id === target.id) continue
      for (const place of unlinkedIn(row.text, names, target)) {
        if (letBe.has(`${source.type}:${row.id}:${place.excerpt}`)) continue
        found.push({ ...place, source: { type: source.type, id: row.id } })
      }
    }
  }
  return found
}

/** Each source thing named as a link to it is; one no longer seen is left out. */
async function named(
  registry: LinkRegistry,
  q: Queryable,
  workspaceId: WorkspaceId,
  found: readonly Found[],
) {
  const titles = new Map<string, LinkCandidate>()
  for (const type of new Set(found.map((f) => f.source.type))) {
    const ids = [...new Set(found.filter((f) => f.source.type === type).map((f) => f.source.id))]
    for (const t of await registry.of(type).rows(q, workspaceId, { ids, limit: ids.length })) {
      titles.set(`${type}:${t.id}`, t)
    }
  }
  return found.flatMap((f) => {
    const source = titles.get(`${f.source.type}:${f.source.id}`)
    return source ? [{ ...f, source }] : []
  })
}

/** Unlinked mentions belong to the shell: any module's text may name any module's thing. */
export const unlinkedRoutes: FastifyPluginAsyncZod<{
  registry: LinkRegistry
  sources: readonly TextSource[]
}> = async (app, { registry, sources }) => {
  const sourceOf = (type: ObjectType) => sources.find((s) => s.type === type)

  serve(app, [
    on(api.unlinked.of, async (req) => {
      const { workspaceId } = currentUser(req)
      const found = await findUnlinked(registry, sources, app.db, workspaceId, req.params)
      if (!found) throw new NotFound('Object')
      const items = await named(registry, app.db, workspaceId, found)
      return { items: items.slice(0, UNLINKED_LISTED), total: items.length }
    }),

    on(api.unlinked.link, async (req) => {
      const ctx = actorOf(req)
      const { source, ...place } = req.body
      const text = sourceOf(source.type)
      if (!text || !(await namesOf(registry, app.db, ctx.workspaceId, req.params))) {
        throw new NotFound('Object')
      }
      await app.db.transaction(async (tx) => {
        const was = await text.read(tx, ctx.workspaceId, source.id)
        if (was === null) throw new NotFound('Object')
        const next = linkUnlinked(was, place, req.params)
        if (next === null || !(await text.rewrite(tx, ctx, source.id, was, next))) {
          throw new PlaceMovedError()
        }
      })
    }),

    on(api.unlinked.dismiss, async (req) => {
      const ctx = actorOf(req)
      if (!(await namesOf(registry, app.db, ctx.workspaceId, req.params))) {
        throw new NotFound('Object')
      }
      await app.db
        .insert(unlinkedDismissed)
        .values({
          workspaceId: ctx.workspaceId,
          targetType: req.params.type,
          targetId: req.params.id,
          sourceType: req.body.source.type,
          sourceId: req.body.source.id,
          excerpt: req.body.excerpt,
          createdAt: ctx.now,
        })
        .onConflictDoNothing()
    }),
  ])
}
