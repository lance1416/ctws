import { api, type ResourceResponse } from '@ctws/contracts'
import { queryOptions } from '@tanstack/react-query'
import { call } from '../../platform/http/api'

/** The thing a resource hangs on. */
export type ResourceOwner = ResourceResponse['owner']

export const resourceKeys = {
  of: (owner: ResourceOwner) => ['resources', owner.type, owner.id] as const,
}

/** A thing's resources, in the order they were put (FR-046). */
export const resourcesQuery = (owner: ResourceOwner) =>
  queryOptions({
    queryKey: resourceKeys.of(owner),
    queryFn: async ({ signal }) =>
      (await call(api.resources.of, { query: owner }, { signal })).resources,
  })

/** A project's pinned resources, by their digit (FR-053). */
export const pinnedOf = (all: readonly ResourceResponse[]): ResourceResponse[] =>
  all.filter((r) => r.pinnedRank !== null).sort((a, b) => (a.pinnedRank ?? 0) - (b.pinnedRank ?? 0))

/** The first digit, 1 to 9, that no resource of the project holds; null once all nine are. */
export function freeDigit(all: readonly ResourceResponse[]): number | null {
  for (let digit = 1; digit <= 9; digit++)
    if (!all.some((r) => r.pinnedRank === digit)) return digit
  return null
}

/** Hangs an address on the owner, then pins it at `digit`. */
export async function pinResource(
  owner: ResourceOwner,
  resource: { url: string; name: string | null },
  digit: number,
): Promise<ResourceResponse> {
  const made = await call(api.resources.create, { body: { owner, ...resource } })
  return call(api.resources.update, { params: { id: made.id }, body: { pinnedRank: digit } })
}
