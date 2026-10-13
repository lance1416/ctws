import {
  type CreateProjectBody,
  type ProjectColor,
  projectColors,
  type UpdateProjectBody,
} from '@ctws/contracts'
import { rankBetween } from '@ctws/core'
import { and, asc, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core'
import { v7 as uuidv7 } from 'uuid'
import type { Queryable } from '../../platform/db/client'
import { projects } from './tables'
import type { ProjectColumns } from '../module'
import { InboxProtectedError, ProjectNotFoundError } from './errors'
import { visibleProjects } from './queries'

/** The quick-capture destination. One per workspace; see schema.ts and the 0003 migration. */
export const INBOX_NAME = 'Inbox'

export type Project = typeof projects.$inferSelect

/** A project as the list returns it: the row and the columns modules add to it. */
export type ProjectListRow = { project: Project; columns: Record<string, number> }

/**
 * Lists a workspace's projects ordered inbox-first, then `(rank, id)`. By default archived projects are hidden;
 * `archived: true` lists them instead. Soft-deleted projects never appear.
 */
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
    // Inbox first, then the user's own order. `desc` on a boolean puts true first.
    .orderBy(desc(projects.isInbox), asc(projects.rank), asc(projects.id))
  return rows.map(({ project, ...values }) => ({
    project,
    columns: values as Record<string, number>,
  }))
}

/**
 * The lowest-numbered colour slot no live project in the workspace is wearing, or slot 1 once all
 * six are taken.
 *
 * ASSIGNED ONCE AND STORED, never hashed from the project's id. A hash is stable per project --
 * the property that matters -- but stable and RANDOM: six buckets and four projects collide with
 * probability 1 - (6·5·4·3)/6^4 = 72%, so four projects usually draw three colours. The first
 * free slot makes the first six distinct by construction, and the seventh collides predictably.
 *
 * Archived projects still hold their slot, for the same reason they still hold their rank:
 * un-archiving must not repaint a project.
 */
function firstFreeColor(taken: readonly (string | null)[]): ProjectColor {
  const used = new Set(taken)
  return projectColors.find((c) => !used.has(c)) ?? projectColors[0]
}

/** Creates a project appended after the workspace's last one. The rank is never client-supplied. */
export async function createProject(
  q: Queryable,
  workspaceId: string,
  input: CreateProjectBody,
): Promise<Project> {
  // Archived projects count: a project that is later un-archived must not collide with a new one.
  const [last] = await q
    .select({ rank: projects.rank })
    .from(projects)
    .where(visibleProjects(workspaceId))
    .orderBy(desc(projects.rank), desc(projects.id))
    .limit(1)

  const taken = await q
    .select({ color: projects.color })
    .from(projects)
    .where(visibleProjects(workspaceId))

  const [row] = await q
    .insert(projects)
    .values({
      id: uuidv7(),
      workspaceId,
      name: input.name,
      color: input.color ?? firstFreeColor(taken.map((t) => t.color)),
      rank: rankBetween(last?.rank ?? null, null),
    })
    .returning()
  return row!
}

export async function updateProject(
  q: Queryable,
  workspaceId: string,
  id: string,
  patch: UpdateProjectBody,
): Promise<Project> {
  // Archiving the inbox hides it from the default project list, which breaks quick capture just
  // as deleting it would. Rename and unarchive stay allowed: the inbox is found by its flag, not
  // its name, and refusing `archived: false` would be a trap.
  if (patch.archived === true) {
    const [existing] = await q
      .select({ isInbox: projects.isInbox })
      .from(projects)
      .where(and(visibleProjects(workspaceId), eq(projects.id, id)))
    if (existing?.isInbox) throw new InboxProtectedError()
  }

  const set: PgUpdateSetSource<typeof projects> = {}
  if (patch.name !== undefined) set.name = patch.name
  if (patch.color !== undefined) set.color = patch.color
  // Archiving keeps the original timestamp if the project is already archived.
  if (patch.archived === true) set.archivedAt = sql`coalesce(${projects.archivedAt}, now())`
  if (patch.archived === false) set.archivedAt = null

  if (Object.keys(set).length === 0) {
    const [row] = await q
      .select()
      .from(projects)
      .where(and(visibleProjects(workspaceId), eq(projects.id, id)))
    if (!row) throw new ProjectNotFoundError()
    return row
  }

  const [row] = await q
    .update(projects)
    .set(set)
    .where(and(visibleProjects(workspaceId), eq(projects.id, id)))
    .returning()
  if (!row) throw new ProjectNotFoundError()
  return row
}

/** Soft delete: the row stays so the event log never points at nothing. */
export async function softDeleteProject(
  q: Queryable,
  workspaceId: string,
  id: string,
): Promise<void> {
  // Checked in the service, not the route: the UI hides the delete control, but a UI is not a
  // constraint. One statement so a concurrent rename cannot slip between check and delete.
  const rows = await q
    .update(projects)
    .set({ deletedAt: sql`now()` })
    .where(and(visibleProjects(workspaceId), eq(projects.id, id), eq(projects.isInbox, false)))
    .returning({ id: projects.id })
  if (rows.length === 0) {
    // Distinguish "is the inbox" from "does not exist" with one extra read, only on the
    // failure path.
    const [existing] = await q
      .select({ isInbox: projects.isInbox })
      .from(projects)
      .where(and(visibleProjects(workspaceId), eq(projects.id, id)))
    if (existing?.isInbox) throw new InboxProtectedError()
    throw new ProjectNotFoundError()
  }
}

/**
 * A PROJECT THIS WORKSPACE MAY FILE SOMETHING UNDER, or a refusal.
 *
 * Three modules wrote this out: reading, meetings and people all have to check a project id
 * before storing it, and all three checked it the same four lines. Projects are the shell's own, so
 * the question "may this workspace use this project" is the shell's to answer -- a module copying
 * it is a module that could answer it differently.
 *
 * A project id from another workspace reads as "no such project" rather than as a refusal that
 * would confirm the id exists.
 */
export async function assertProjectVisible(
  q: Queryable,
  workspaceId: string,
  projectId: string,
): Promise<void> {
  const rows = await q
    .select({ id: projects.id })
    .from(projects)
    .where(and(visibleProjects(workspaceId), eq(projects.id, projectId)))
  if (rows.length === 0) throw new ProjectNotFoundError()
}
