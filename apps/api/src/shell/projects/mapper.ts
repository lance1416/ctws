import type { ProjectResponse } from '@ctws/contracts'
import { isoOrNull } from '../../platform/values'
import type { ProjectRow } from './queries'

export function toProjectResponse({ project: p, columns }: ProjectRow): ProjectResponse {
  return {
    id: p.id,
    workspaceId: p.workspaceId,
    name: p.name,
    color: p.color,
    isInbox: p.isInbox,
    rank: p.rank,
    archivedAt: isoOrNull(p.archivedAt),
    createdAt: p.createdAt.toISOString(),
    columns,
  }
}
