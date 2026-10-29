import {
  type ObjectType,
  type ResourceId,
  resourceId,
  type ResourceResponse,
  type UpdateResourceBody,
  type WorkspaceId,
} from '@ctws/contracts'
import { rankBetween, resourceLook } from '@ctws/core'
import { and, asc, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm'
import type { Queryable, Tx } from '../../platform/db/client'
import { DomainError, NotFound } from '../../platform/errors'
import { newId } from '../../platform/db/ids'
import { type Actor, scoped, within } from '../../platform/db/scope'
import { eventLog } from '../events'
import { projects } from '../projects/tables'
import { type Resource, resources } from './tables'

/** The thing a resource hangs on. */
export type Owner = { type: ObjectType; id: string }

export const toResourceResponse = (r: Resource): ResourceResponse => ({
  id: r.id,
  owner: { type: r.ownerType, id: r.ownerId },
  url: r.url,
  name: r.name,
  rank: r.rank,
  pinnedRank: r.pinnedRank,
  createdAt: r.createdAt.toISOString(),
})

/** Only a project pins resources in its head (FR-053). */
class OnlyProjectsPin extends DomainError {
  constructor() {
    super('unprocessable', { detail: 'only a project pins resources in its head' })
  }
}

/** The digit key is already taken by another resource of this project. */
class KeyTaken extends DomainError {
  constructor(rank: number) {
    super('conflict', { detail: `another resource is already pinned at ${rank}` })
  }
}

/** A thing's resources in the order they were put. */
export async function resourcesOf(
  q: Queryable,
  workspaceId: WorkspaceId,
  owner: Owner,
): Promise<Resource[]> {
  return q
    .select()
    .from(resources)
    .where(
      within(
        scoped(resources, workspaceId),
        eq(resources.ownerType, owner.type),
        eq(resources.ownerId, owner.id),
      ),
    )
    .orderBy(asc(resources.rank), asc(resources.id))
}

/**
 * Each of `ids`' first GitHub pull request, as its label ("#418"): what a card on the board says of
 * its task (FR-057). In the owners' own order of their resources; an owner with none is not a key.
 */
export async function pullRequestsOf(
  q: Queryable,
  workspaceId: WorkspaceId,
  type: ObjectType,
  ids: readonly string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (ids.length === 0) return out
  const rows = await q
    .select({ ownerId: resources.ownerId, url: resources.url })
    .from(resources)
    .where(
      within(
        scoped(resources, workspaceId),
        eq(resources.ownerType, type),
        inArray(resources.ownerId, [...ids]),
      ),
    )
    .orderBy(asc(resources.rank), asc(resources.id))
  for (const r of rows) {
    if (out.has(r.ownerId)) continue
    const look = resourceLook(r.url)
    if (look.service === 'github-pr') out.set(r.ownerId, look.label)
  }
  return out
}

/**
 * What the projects still worked on pin in their heads (FR-076): not an archived project's, nor a
 * deleted one's. In the projects' own order, then by digit.
 */
export async function pinnedOnActiveProjects(
  q: Queryable,
  workspaceId: WorkspaceId,
): Promise<Resource[]> {
  const rows = await q
    .select({ resource: resources })
    .from(resources)
    .innerJoin(
      projects,
      and(eq(projects.workspaceId, resources.workspaceId), eq(projects.id, resources.ownerId)),
    )
    .where(
      within(
        scoped(resources, workspaceId),
        eq(resources.ownerType, 'project'),
        isNotNull(resources.pinnedRank),
        isNull(projects.archivedAt),
        isNull(projects.deletedAt),
      ),
    )
    .orderBy(asc(projects.rank), asc(projects.id), asc(resources.pinnedRank))
  return rows.map((r) => r.resource)
}

async function getResource(
  q: Queryable,
  workspaceId: WorkspaceId,
  id: ResourceId,
): Promise<Resource> {
  const [row] = await q
    .select()
    .from(resources)
    .where(within(scoped(resources, workspaceId), eq(resources.id, id)))
  if (!row) throw new NotFound('Resource')
  return row
}

/** Appends a resource after the owner's last one. The caller has checked the owner is visible. */
export async function addResource(
  tx: Tx,
  ctx: Actor,
  input: { owner: Owner; url: string; name?: string | null | undefined },
): Promise<Resource> {
  const [last] = await tx
    .select({ rank: resources.rank })
    .from(resources)
    .where(and(eq(resources.ownerType, input.owner.type), eq(resources.ownerId, input.owner.id)))
    .orderBy(desc(resources.rank), desc(resources.id))
    .limit(1)
  const [row] = await tx
    .insert(resources)
    .values({
      id: newId(resourceId),
      workspaceId: ctx.workspaceId,
      ownerType: input.owner.type,
      ownerId: input.owner.id,
      url: input.url,
      name: input.name ?? null,
      rank: rankBetween(last?.rank ?? null, null),
      createdAt: ctx.now,
    })
    .returning()
  await eventLog(tx, ctx).append(input.owner, 'resource_added', { url: row!.url, name: row!.name })
  return row!
}

export async function updateResource(
  tx: Tx,
  ctx: Actor,
  id: ResourceId,
  patch: UpdateResourceBody,
): Promise<Resource> {
  const row = await getResource(tx, ctx.workspaceId, id)
  if (patch.pinnedRank !== undefined && patch.pinnedRank !== null && row.ownerType !== 'project') {
    throw new OnlyProjectsPin()
  }
  if (patch.pinnedRank !== undefined && patch.pinnedRank !== null) {
    const [taken] = await tx
      .select({ id: resources.id })
      .from(resources)
      .where(
        and(
          eq(resources.ownerType, row.ownerType),
          eq(resources.ownerId, row.ownerId),
          eq(resources.pinnedRank, patch.pinnedRank),
        ),
      )
    if (taken && taken.id !== row.id) throw new KeyTaken(patch.pinnedRank)
  }
  const set = {
    ...(patch.url !== undefined ? { url: patch.url } : {}),
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.pinnedRank !== undefined ? { pinnedRank: patch.pinnedRank } : {}),
  }
  if (Object.keys(set).length === 0) return row
  const [updated] = await tx.update(resources).set(set).where(eq(resources.id, id)).returning()
  return updated!
}

export async function removeResource(tx: Tx, ctx: Actor, id: ResourceId): Promise<void> {
  const row = await getResource(tx, ctx.workspaceId, id)
  await tx.delete(resources).where(eq(resources.id, id))
  await eventLog(tx, ctx).append({ type: row.ownerType, id: row.ownerId }, 'resource_removed', {
    url: row.url,
    name: row.name,
  })
}
