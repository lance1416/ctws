import { type ProjectListItem, projectColor, type ProjectResponse } from '@ctws/contracts'
import { isoOrNull } from '../../platform/values'
import type { ProjectListRow } from './queries'
import type { Project } from './tables'

export function toProjectResponse(p: Project): ProjectResponse {
  return {
    id: p.id,
    workspaceId: p.workspaceId,
    name: p.name,
    // The column is plain text; a slot this build does not know reads as no colour.
    color: projectColor.safeParse(p.color).data ?? null,
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
