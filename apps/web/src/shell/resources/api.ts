import { resourceLook } from '@ctws/core'
import { api, type ResourceResponse } from '@ctws/contracts'
import { queryOptions } from '@tanstack/react-query'
import { call } from '../../platform/http/api'

/** The thing a resource hangs on. */
export type ResourceOwner = ResourceResponse['owner']

export const resourceKeys = {
  of: (owner: ResourceOwner) => ['resources', owner.type, owner.id] as const,
  pinned: ['resources', 'pinned'] as const,
}

/** A thing's resources, in the order they were put (FR-046). */
export const resourcesQuery = (owner: ResourceOwner) =>
  queryOptions({
    queryKey: resourceKeys.of(owner),
    queryFn: async ({ signal }) =>
      (await call(api.resources.of, { query: owner }, { signal })).resources,
  })

/** What the projects still worked on pin in their heads: the launcher's links (FR-076). */
export const pinnedEverywhereQuery = () =>
  queryOptions({
    queryKey: resourceKeys.pinned,
    queryFn: async ({ signal }) => (await call(api.resources.pinned, {}, { signal })).resources,
  })

/**
 * The address to follow, only when it is http(s). The server takes no other, but a row older than
 * that rule is never handed to a link or `window.open` as, say, `javascript:`.
 */
export const followable = (url: string): string | undefined =>
  /^https?:\/\//i.test(url) ? url : undefined

/** What a resource is called: its own name, else what its address says it is. */
export const resourceName = (r: Pick<ResourceResponse, 'name' | 'url'>) =>
  r.name ?? resourceLook(r.url).label

/** A project's pinned resources, by their digit (FR-053). */
export const pinnedOf = (all: readonly ResourceResponse[]): ResourceResponse[] =>
  all.filter((r) => r.pinnedRank !== null).sort((a, b) => (a.pinnedRank ?? 0) - (b.pinnedRank ?? 0))

/** The first digit, 1 to 9, that no resource of the project holds; null once all nine are. */
export function freeDigit(all: readonly ResourceResponse[]): number | null {
  for (let digit = 1; digit <= 9; digit++)
    if (!all.some((r) => r.pinnedRank === digit)) return digit
  return null
}

/** Hangs an address on the owner. */
export const addResource = (owner: ResourceOwner, resource: { url: string; name: string | null }) =>
  call(api.resources.create, { body: { owner, ...resource } })

/** Hangs an address on the owner, then pins it at `digit`. */
export async function pinResource(
  owner: ResourceOwner,
  resource: { url: string; name: string | null },
  digit: number,
): Promise<ResourceResponse> {
  const made = await addResource(owner, resource)
  return call(api.resources.update, { params: { id: made.id }, body: { pinnedRank: digit } })
}

/** Hangs an address on a project and pins it at the first digit free there; null when none is. */
export async function pinOnProject(
  projectId: ResourceOwner['id'],
  resource: { url: string; name: string | null },
): Promise<ResourceResponse | null> {
  const owner = { type: 'project', id: projectId } as const
  const theirs = (await call(api.resources.of, { query: owner })).resources
  const digit = freeDigit(theirs)
  return digit === null ? null : pinResource(owner, resource, digit)
}
