import { type WorkspaceId, type ProjectId } from '@ctws/contracts'
import { asc, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm'
import type { Queryable } from '../../platform/db/client'
import { scoped, within } from '../../platform/db/scope'
import type { ProjectColumns } from '../module'
import { ProjectNotFoundError } from './errors'
import { projects, type Project } from './tables'

/**
 * Every id names a live project in this workspace, or none is used. A foreign id reads as not
 * found, never as a refusal that confirms it exists.
 */
export async function assertProjectsVisible(
  q: Queryable,
  workspaceId: WorkspaceId,
  ids: readonly ProjectId[],
): Promise<void> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return
  const rows = await q
    .select({ id: projects.id })
    .from(projects)
    .where(within(scoped(projects, workspaceId), inArray(projects.id, unique)))
  if (rows.length !== unique.length) throw new ProjectNotFoundError()
}

/** The stored id of a live project in this workspace, so a differently cased id compares equal. */
export async function visibleProjectId(
  q: Queryable,
  workspaceId: WorkspaceId,
  id: ProjectId,
): Promise<ProjectId> {
  const [row] = await q
    .select({ id: projects.id })
    .from(projects)
    .where(within(scoped(projects, workspaceId), eq(projects.id, id)))
  if (!row) throw new ProjectNotFoundError()
  return row.id
}

/** A project and the columns modules add to it. */
export type ProjectListRow = { project: Project; columns: Record<string, number> }

/** Inbox first, then the person's own order; archived projects only when asked for. */
export async function listProjects(
  q: Queryable,
  workspaceId: WorkspaceId,
  opts: { archived: boolean },
  columns: ProjectColumns,
): Promise<ProjectListRow[]> {
  const rows = await q
    .select({ project: projects, ...columns })
    .from(projects)
    .where(
      within(
        scoped(projects, workspaceId),
        opts.archived ? isNotNull(projects.archivedAt) : isNull(projects.archivedAt),
      ),
    )
    // `desc` on a boolean puts true first.
    .orderBy(desc(projects.isInbox), asc(projects.rank), asc(projects.id))
  return rows.map(({ project, ...values }) => ({
    project,
    columns: values as Record<string, number>,
  }))
}
