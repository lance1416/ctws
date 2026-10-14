import { and, asc, desc, eq, inArray, isNotNull, isNull, sql, type SQL } from 'drizzle-orm'
import type { Queryable } from '../../platform/db/client'
import { ident } from '../../platform/db/sql'
import type { ProjectColumns } from '../module'
import { ProjectNotFoundError } from './errors'
import { projects, type Project } from './tables'

/** A live project in this workspace. Every read of a project, or of a task through it, uses this. */
export function visibleProjects(workspaceId: string): SQL {
  return and(eq(projects.workspaceId, workspaceId), isNull(projects.deletedAt))!
}

/** The same predicate for raw SQL over the alias `project`. */
export function projectVisibleSql(project: string, workspaceId: string): SQL {
  return sql`${ident(project)}.workspace_id = ${workspaceId} and ${ident(project)}.deleted_at is null`
}

/**
 * Every id names a live project in this workspace, or none is used. A foreign id reads as not
 * found, never as a refusal that confirms it exists.
 */
export async function assertProjectsVisible(
  q: Queryable,
  workspaceId: string,
  ids: readonly string[],
): Promise<void> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return
  const rows = await q
    .select({ id: projects.id })
    .from(projects)
    .where(and(visibleProjects(workspaceId), inArray(projects.id, unique)))
  if (rows.length !== unique.length) throw new ProjectNotFoundError()
}

/** The stored id of a live project in this workspace, so a differently cased id compares equal. */
export async function visibleProjectId(
  q: Queryable,
  workspaceId: string,
  id: string,
): Promise<string> {
  const [row] = await q
    .select({ id: projects.id })
    .from(projects)
    .where(and(visibleProjects(workspaceId), eq(projects.id, id)))
  if (!row) throw new ProjectNotFoundError()
  return row.id
}

/** A project and the columns modules add to it. */
export type ProjectListRow = { project: Project; columns: Record<string, number> }

/** Inbox first, then the person's own order; archived projects only when asked for. */
export async function listProjects(
  q: Queryable,
  workspaceId: string,
  opts: { archived: boolean },
  columns: ProjectColumns,
): Promise<ProjectListRow[]> {
  const rows = await q
    .select({ project: projects, ...columns })
    .from(projects)
    .where(
      and(
        visibleProjects(workspaceId),
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
