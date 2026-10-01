import type { CreateProjectBody, UpdateProjectBody } from '@ctws/contracts'
import { rankBetween } from '@ctws/core'
import { and, asc, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core'
import { v7 as uuidv7 } from 'uuid'
import type { Queryable } from '../db/client'
import { projects } from '../db/schema'

export type Project = typeof projects.$inferSelect

/**
 * Raised when a project does not exist, is soft-deleted, or belongs to another workspace. The
 * three cases are deliberately one error: telling them apart would let a caller probe which
 * project ids exist in workspaces they cannot see.
 */
export class ProjectNotFoundError extends Error {
  constructor() {
    super('Project not found')
    this.name = 'ProjectNotFoundError'
  }
}

// Every query goes through this predicate, so scoping and soft-delete filtering cannot be
// forgotten on one path. `workspaceId` is a required parameter of every exported function.
function visible(workspaceId: string) {
  return and(eq(projects.workspaceId, workspaceId), isNull(projects.deletedAt))
}

/**
 * Lists a workspace's projects ordered by `(rank, id)`. By default archived projects are hidden;
 * `archived: true` lists them instead. Soft-deleted projects never appear.
 */
export async function listProjects(
  q: Queryable,
  workspaceId: string,
  opts: { archived: boolean },
): Promise<Project[]> {
  return q
    .select()
    .from(projects)
    .where(
      and(
        visible(workspaceId),
        opts.archived ? isNotNull(projects.archivedAt) : isNull(projects.archivedAt),
      ),
    )
    .orderBy(asc(projects.rank), asc(projects.id))
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
    .where(visible(workspaceId))
    .orderBy(desc(projects.rank), desc(projects.id))
    .limit(1)

  const [row] = await q
    .insert(projects)
    .values({
      id: uuidv7(),
      workspaceId,
      name: input.name,
      color: input.color ?? null,
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
      .where(and(visible(workspaceId), eq(projects.id, id)))
    if (!row) throw new ProjectNotFoundError()
    return row
  }

  const [row] = await q
    .update(projects)
    .set(set)
    .where(and(visible(workspaceId), eq(projects.id, id)))
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
  const rows = await q
    .update(projects)
    .set({ deletedAt: sql`now()` })
    .where(and(visible(workspaceId), eq(projects.id, id)))
    .returning({ id: projects.id })
  if (rows.length === 0) throw new ProjectNotFoundError()
}
