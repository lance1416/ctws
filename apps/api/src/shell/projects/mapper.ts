import type { ProjectListItem, ProjectResponse } from '@ctws/contracts'
import { isoOrNull } from '../../platform/values'
import type { ProjectListRow } from './queries'
import type { Project } from './tables'

export function toProjectResponse(p: Project): ProjectResponse {
  return {
    id: p.id,
    workspaceId: p.workspaceId,
    name: p.name,
    color: p.color,
    isInbox: p.isInbox,
    rank: p.rank,
    archivedAt: isoOrNull(p.archivedAt),
    createdAt: p.createdAt.toISOString(),
  }
}

/** The response schema checks that the module columns cover the remaining fields. */
export function toProjectListItem(row: ProjectListRow): ProjectListItem {
  return { ...toProjectResponse(row.project), ...row.columns } as ProjectListItem
}
