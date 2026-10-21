import type { ProjectResponse, StageResponse } from '@ctws/contracts'
import { isoOrNull } from '../../platform/values'
import type { ProjectRow } from './queries'

export function toProjectResponse(
  { project: p, columns }: ProjectRow,
  stages: StageResponse[] = [],
): ProjectResponse {
  return {
    id: p.id,
    workspaceId: p.workspaceId,
    name: p.name,
    color: p.color,
    initials: p.initials,
    isInbox: p.isInbox,
    rank: p.rank,
    archivedAt: isoOrNull(p.archivedAt),
    createdAt: p.createdAt.toISOString(),
    columns,
    stages,
  }
}
