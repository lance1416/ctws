import { api, type OrganisationResponse, type WorkspaceId } from '@ctws/contracts'
import type { FastifyRequest } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { Queryable } from '../../platform/db/client'
import { on, serve } from '../../platform/http/serve'
import { actorOf, currentUser } from '../../shell/auth'
import { standingOf, type LinkRegistry } from '../../shell/links'
import {
  getOrganisation,
  listOrganisations,
  monthOf,
  countOrganisations,
  organisationTypes,
  rolesAt,
  searchOrganisations,
} from './queries'
import {
  createOrganisation,
  deleteOrganisation,
  mergeOrganisation,
  updateOrganisation,
} from './service'
import type { Organisation } from './tables'

/**
 * An organisation with the people who hold or held a role there. The people are named through the
 * registry, as every cross-module read is, so this module never reads the people table itself.
 */
async function respond(
  registry: LinkRegistry,
  q: Queryable,
  workspaceId: WorkspaceId,
  row: Organisation,
): Promise<OrganisationResponse> {
  const roles = await rolesAt(q, workspaceId, row.id)
  const ids = [...new Set(roles.map((r) => r.personId))]
  const people =
    ids.length === 0
      ? []
      : await registry.of('person').rows(q, workspaceId, { ids, limit: ids.length })
  const named = new Map(people.map((p) => [p.id, p.title]))
  const standing = await standingOf(registry, q, workspaceId, [row.id])
  const holders = roles
    .filter((r) => named.has(r.personId))
    .map((r) => ({
      personId: r.personId,
      name: named.get(r.personId)!,
      title: r.title,
      from: monthOf(r.fromMonth),
      to: monthOf(r.toMonth),
    }))
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    website: row.website,
    city: row.city,
    cityKey: row.cityKey,
    note: row.note,
    people: {
      now: holders.filter((h) => h.to === null),
      before: holders.filter((h) => h.to !== null),
    },
    roleCount: new Set(holders.map((h) => h.personId)).size,
    inProjects: standing.get(row.id) ?? [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export const organisationRoutes: FastifyPluginAsyncZod<{ registry: LinkRegistry }> = async (
  app,
  { registry },
) => {
  const say = (req: FastifyRequest, row: Organisation) =>
    respond(registry, app.db, currentUser(req).workspaceId, row)
  serve(app, [
    on(api.organisations.list, async (req) => {
      const { workspaceId } = currentUser(req)
      const { type, ...asked } = req.query
      const { rows, page } = await listOrganisations(app.db, workspaceId, type, asked)
      return { organisations: await Promise.all(rows.map((r) => say(req, r))), page }
    }),

    on(api.organisations.types, async (req) => ({
      types: await organisationTypes(app.db, currentUser(req).workspaceId),
    })),

    on(api.organisations.overview, async (req) => {
      const { workspaceId } = currentUser(req)
      const types = await organisationTypes(app.db, workspaceId)
      const total = await countOrganisations(app.db, workspaceId)
      return { types, untyped: total - types.reduce((n, t) => n + t.count, 0), total }
    }),

    on(api.organisations.search, async (req) => {
      const { rows, page } = await searchOrganisations(
        app.db,
        currentUser(req).workspaceId,
        req.query.q,
        req.query,
      )
      return { organisations: await Promise.all(rows.map((r) => say(req, r))), page }
    }),

    on(api.organisations.get, async (req) =>
      say(req, await getOrganisation(app.db, currentUser(req).workspaceId, req.params.id)),
    ),

    on(api.organisations.create, async (req) =>
      say(req, await createOrganisation(app.db, actorOf(req), req.body)),
    ),

    on(api.organisations.update, async (req) =>
      say(req, await updateOrganisation(app.db, actorOf(req), req.params.id, req.body)),
    ),

    on(api.organisations.merge, async (req) =>
      say(req, await mergeOrganisation(app.db, actorOf(req), req.params.id, req.body.into)),
    ),

    on(api.organisations.remove, async (req) => {
      await deleteOrganisation(app.db, actorOf(req), req.params.id)
    }),
  ])
}
