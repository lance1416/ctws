import { type WorkspaceId, type ProjectId } from '@ctws/contracts'
import { asc, desc, eq, inArray, isNotNull, isNull, sql, type SQL } from 'drizzle-orm'
import type { Queryable, Tx } from '../../platform/db/client'
import { type Scope, scoped, scopedRow, within } from '../../platform/db/scope'
import { ident } from '../../platform/db/sql'
import type { ProjectColumns } from '../module'
import { projects, type Project } from './tables'
import { type Page, type PageAsked, pageOf, spanOf } from '../../platform/db/page'
import { NotFound } from '../../platform/errors'

/** `desc` on a boolean puts true first. */
const LIST_ORDER = [desc(projects.isInbox), asc(projects.rank), asc(projects.id)]

/**
 * A module's raw SQL that joins the relation `projects` under `alias` confines it with this. What
 * it may read there is `id`, `name`, `rank`, `archived_at` and `is_inbox`.
 */
export const projectScope = (workspaceId: WorkspaceId, alias: string): Scope =>
  scoped(projects, workspaceId, alias)

/** The project that `projectId` names is live in this workspace, for a query that does not join it. */
export const inLiveProject = (workspaceId: WorkspaceId, projectId: SQL): Scope =>
  scopedRow(projects, workspaceId, projectId)

/** The name of the project that `projectId` names, as a column of a module's query. */
export const projectNameOf = (projectId: SQL): SQL<string> =>
  sql<string>`(select ${ident('named')}.name from ${projects} ${ident('named')} where ${ident('named')}.id = ${projectId})`

/** The live, unarchived projects in list order: inbox first, then the person's own order. */
export async function unarchivedProjects(
  q: Queryable,
  workspaceId: WorkspaceId,
): Promise<{ id: ProjectId; name: string }[]> {
  return q
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(within(scoped(projects, workspaceId), isNull(projects.archivedAt)))
    .orderBy(...LIST_ORDER)
}

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
  if (rows.length !== unique.length) throw new NotFound('Project')
}

/** One live project in this workspace. Missing, deleted and foreign ids all read as not found. */
export async function getProject(
  q: Queryable,
  workspaceId: WorkspaceId,
  id: ProjectId,
): Promise<Project> {
  const [row] = await q
    .select()
    .from(projects)
    .where(within(scoped(projects, workspaceId), eq(projects.id, id)))
  if (!row) throw new NotFound('Project')
  return row
}

/** `getProject`, with the row locked for the rest of the transaction. */
export async function lockProject(
  tx: Tx,
  workspaceId: WorkspaceId,
  id: ProjectId,
): Promise<Project> {
  const [row] = await tx
    .select()
    .from(projects)
    .where(within(scoped(projects, workspaceId), eq(projects.id, id)))
    .for('update')
  if (!row) throw new NotFound('Project')
  return row
}

/** A project and the columns modules add to it. */
export type ProjectListRow = { project: Project; columns: Record<string, number> }

/** One project, archived or not, with the columns modules add to it. */
export async function getProjectRow(
  q: Queryable,
  workspaceId: WorkspaceId,
  id: ProjectId,
  columns: ProjectColumns,
): Promise<ProjectListRow> {
  const [row] = await q
    .select({ project: projects, columns })
    .from(projects)
    .where(within(scoped(projects, workspaceId), eq(projects.id, id)))
  if (!row) throw new NotFound('Project')
  return row
}

/** Inbox first, then the person's own order; archived projects only when asked for. */
export async function listProjects(
  q: Queryable,
  workspaceId: WorkspaceId,
  opts: { archived: boolean },
  columns: ProjectColumns,
  asked: PageAsked,
): Promise<Page<ProjectListRow>> {
  const span = spanOf(asked)
  const rows = await q
    .select({ project: projects, columns })
    .from(projects)
    .where(
      within(
        scoped(projects, workspaceId),
        opts.archived ? isNotNull(projects.archivedAt) : isNull(projects.archivedAt),
      ),
    )
    .orderBy(...LIST_ORDER)
    .limit(span.limit)
    .offset(span.offset)
  const { rows: page, ...info } = pageOf(rows, asked)
  return { rows: page, ...info }
}
