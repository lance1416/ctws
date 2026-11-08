import {
  type ObjectType,
  type PreviewState,
  type ResourceId,
  resourceId,
  type ResourceResponse,
  type UpdateResourceBody,
  type WorkspaceId,
} from '@ctws/contracts'
import { rankBetween, resourceLook } from '@ctws/core'
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lt, ne } from 'drizzle-orm'
import type { Queryable, Tx } from '../../platform/db/client'
import { DomainError, NotFound } from '../../platform/errors'
import { newId } from '../../platform/db/ids'
import { type Actor, scoped, within } from '../../platform/db/scope'
import { eventLog } from '../events'
import { letGo } from '../files/service'
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
  preview:
    r.previewState === 'done'
      ? { title: r.previewTitle, siteName: r.previewSite, iconId: r.iconId, imageId: r.imageId }
      : null,
  previewState: r.previewState,
  createdAt: r.createdAt.toISOString(),
})

/** Only a project pins resources in its head. */
class OnlyProjectsPin extends DomainError {
  constructor() {
    super('unprocessable', { detail: 'only a project pins resources in its head' })
  }
}

/** The address is another of the same thing's resources. */
class AlreadyThere extends DomainError {
  constructor() {
    super('conflict', { detail: 'that address is already one of its resources' })
  }
}

/** The digit key is already taken by another resource of this project. */
class KeyTaken extends DomainError {
  constructor(rank: number) {
    super('conflict', { detail: `another resource is already pinned at ${rank}` })
  }
}

/** A drag named a neighbour that is not one of the same thing's resources. */
class NotANeighbour extends DomainError {
  constructor() {
    super('unprocessable', { detail: "the neighbour is not one of the same thing's resources" })
  }
}

/** A thing's resources in their order: as they were put, then as they were dragged. */
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
 * its task. In the owners' own order of their resources; an owner with none is not a key.
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
 * What the projects still worked on pin in their heads: not an archived project's, nor a
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

/** A new address's card: waiting to be fetched, or never, with fetching off. */
const waiting = (opts: { previews: boolean }): PreviewState => (opts.previews ? 'pending' : 'none')

/** The same address however it is written: its host's case, a trailing slash, an empty fragment. */
function sameAddress(a: string, b: string): boolean {
  const norm = (u: string) => URL.parse(u)?.href ?? u
  return norm(a) === norm(b)
}

/** The owner's resource with this address, if it has one. */
async function resourceAt(
  q: Queryable,
  owner: Owner,
  url: string,
  except?: ResourceId,
): Promise<Resource | null> {
  const rows = await q
    .select()
    .from(resources)
    .where(and(eq(resources.ownerType, owner.type), eq(resources.ownerId, owner.id)))
  return rows.find((r) => r.id !== except && sameAddress(r.url, url)) ?? null
}

/**
 * Appends a resource after the owner's last one. An address the owner already has is not added
 * twice: that resource is answered instead, with `existing` set.
 */
export async function addResource(
  tx: Tx,
  ctx: Actor,
  input: { owner: Owner; url: string; name?: string | null | undefined },
  opts: { previews: boolean },
): Promise<Resource & { existing: boolean }> {
  const had = await resourceAt(tx, input.owner, input.url)
  if (had) return { ...had, existing: true }
  return { ...(await insertResource(tx, ctx, input, opts)), existing: false }
}

async function insertResource(
  tx: Tx,
  ctx: Actor,
  input: { owner: Owner; url: string; name?: string | null | undefined },
  opts: { previews: boolean },
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
      previewState: waiting(opts),
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
  opts: { previews: boolean },
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
  const neighbourId = patch.beforeId ?? patch.afterId
  // Another address is another page: its card is fetched anew, and the old one's pictures go.
  const moved = patch.url !== undefined && patch.url !== row.url
  if (moved && (await resourceAt(tx, { type: row.ownerType, id: row.ownerId }, patch.url!, id))) {
    throw new AlreadyThere()
  }
  if (moved) await letGo(tx, ctx.now, [row.iconId, row.imageId])
  const set = {
    ...(patch.url !== undefined ? { url: patch.url } : {}),
    ...(moved ? { ...NO_PREVIEW, previewState: waiting(opts) } : {}),
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.pinnedRank !== undefined ? { pinnedRank: patch.pinnedRank } : {}),
    ...(neighbourId !== undefined
      ? { rank: await rankNextTo(tx, row, neighbourId, patch.beforeId !== undefined) }
      : {}),
  }
  if (Object.keys(set).length === 0) return row
  // A drag among a project's pinned ones changes their number keys, in the same step; a number
  // given in the same patch is the person's own and is not overruled.
  const tracking =
    neighbourId !== undefined && patch.pinnedRank === undefined && row.ownerType === 'project'
  const before = tracking ? await pinnedInOrder(tx, row.ownerId) : []
  const [updated] = await tx.update(resources).set(set).where(eq(resources.id, id)).returning()
  if (tracking && (await renumberPinned(tx, row.ownerId, before))) {
    return getResource(tx, ctx.workspaceId, id)
  }
  return updated!
}

/** A project's pinned resources, in the order they stand in. */
async function pinnedInOrder(tx: Tx, projectId: string): Promise<ResourceId[]> {
  const rows = await tx
    .select({ id: resources.id })
    .from(resources)
    .where(
      and(
        eq(resources.ownerType, 'project'),
        eq(resources.ownerId, projectId),
        isNotNull(resources.pinnedRank),
      ),
    )
    .orderBy(asc(resources.rank), asc(resources.id))
  return rows.map((r) => r.id)
}

/**
 * When a move has changed the order the pinned ones stand in (`before` is the order they stood
 * in), gives them the number keys 1, 2, 3 in the new order. Moving an unpinned one, or a pinned
 * one within the unpinned, leaves their keys as they were. Answers whether any key changed.
 */
async function renumberPinned(
  tx: Tx,
  projectId: string,
  before: readonly ResourceId[],
): Promise<boolean> {
  const after = await pinnedInOrder(tx, projectId)
  if (after.every((id, at) => id === before[at])) return false
  // The keys are unique, so they all move aside before any takes its new number.
  await tx
    .update(resources)
    .set({ pinnedRank: null })
    .where(and(eq(resources.ownerType, 'project'), inArray(resources.id, after)))
  for (const [at, id] of after.entries()) {
    await tx
      .update(resources)
      .set({ pinnedRank: at + 1 })
      .where(eq(resources.id, id))
  }
  return true
}

/**
 * The rank that puts `row` just before or just after `neighbourId` among its owner's resources.
 * Only the moved row is written. A neighbour that is not one of the same owner's is refused.
 */
async function rankNextTo(
  tx: Tx,
  row: Resource,
  neighbourId: ResourceId,
  before: boolean,
): Promise<string> {
  const siblings = and(
    eq(resources.ownerType, row.ownerType),
    eq(resources.ownerId, row.ownerId),
    ne(resources.id, row.id),
  )
  const [neighbour] = await tx
    .select({ rank: resources.rank })
    .from(resources)
    .where(and(siblings, eq(resources.id, neighbourId)))
  if (!neighbour) throw new NotANeighbour()
  // Strictly before or after: ranks are not unique, and rankBetween needs before < after.
  if (before) {
    const [prev] = await tx
      .select({ rank: resources.rank })
      .from(resources)
      .where(and(siblings, lt(resources.rank, neighbour.rank)))
      .orderBy(desc(resources.rank), desc(resources.id))
      .limit(1)
    return rankBetween(prev?.rank ?? null, neighbour.rank)
  }
  const [next] = await tx
    .select({ rank: resources.rank })
    .from(resources)
    .where(and(siblings, gt(resources.rank, neighbour.rank)))
    .orderBy(asc(resources.rank), asc(resources.id))
    .limit(1)
  return rankBetween(neighbour.rank, next?.rank ?? null)
}

/** What a resource's card was, cleared. */
const NO_PREVIEW = { previewTitle: null, previewSite: null, iconId: null, imageId: null }

/**
 * Marks a resource's card to be fetched again; its pictures stay until the new ones arrive. With
 * fetching off there is nothing to fetch it with, and it stays as it is.
 */
export async function refreshPreview(
  tx: Tx,
  ctx: Actor,
  id: ResourceId,
  opts: { previews: boolean },
): Promise<Resource> {
  const current = await getResource(tx, ctx.workspaceId, id)
  if (!opts.previews) return current
  const [row] = await tx
    .update(resources)
    .set({ previewState: 'pending' })
    .where(eq(resources.id, id))
    .returning()
  return row!
}

export async function removeResource(tx: Tx, ctx: Actor, id: ResourceId): Promise<void> {
  const row = await getResource(tx, ctx.workspaceId, id)
  await letGo(tx, ctx.now, [row.iconId, row.imageId])
  await tx.delete(resources).where(eq(resources.id, id))
  await eventLog(tx, ctx).append({ type: row.ownerType, id: row.ownerId }, 'resource_removed', {
    url: row.url,
    name: row.name,
  })
}
