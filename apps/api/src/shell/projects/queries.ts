import { and, eq, isNull, sql, type SQL } from 'drizzle-orm'
import { ident } from '../../platform/db/sql'
import { projects } from './tables'

/** A live project in this workspace. Every read of a project, or of a task through it, uses this. */
export function visibleProjects(workspaceId: string): SQL {
  return and(eq(projects.workspaceId, workspaceId), isNull(projects.deletedAt))!
}

/** The same predicate for raw SQL over the alias `project`. */
export function projectVisibleSql(project: string, workspaceId: string): SQL {
  return sql`${ident(project)}.workspace_id = ${workspaceId} and ${ident(project)}.deleted_at is null`
}
