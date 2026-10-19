import type { PersonId, ReadingItemResponse } from '@ctws/contracts'
import type { ReadingItemRow } from './queries'

/** `names` says who the recommenders are, read through the registry by the routes. */
export function toReadingItemResponse(
  r: ReadingItemRow,
  names: ReadonlyMap<PersonId, string> = new Map(),
): ReadingItemResponse {
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    url: r.url,
    author: r.author,
    status: r.status,
    planOn: r.planOn,
    projectId: r.projectId,
    projectName: r.projectName,
    recommendedBy:
      r.recommendedBy !== null && names.has(r.recommendedBy)
        ? { id: r.recommendedBy, name: names.get(r.recommendedBy)! }
        : null,
    fetchedTitle: r.fetchedTitle,
    fetchedSummary: r.fetchedSummary,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }
}
