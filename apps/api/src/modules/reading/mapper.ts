import type { ReadingItemResponse } from '@ctws/contracts'
import type { ReadingItemRow } from './queries'

export function toReadingItemResponse(r: ReadingItemRow): ReadingItemResponse {
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
    fetchedTitle: r.fetchedTitle,
    fetchedSummary: r.fetchedSummary,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }
}
