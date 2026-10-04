import type { CreateProjectBody, UpdateProjectBody } from '@ctws/contracts'
import { rankBetween } from '@ctws/core'
import { and, asc, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core'
import { v7 as uuidv7 } from 'uuid'
import type { Queryable } from '../db/client'
import { projects } from '../db/schema'
import { InboxNotDeletableError } from './errors'

/** The quick-capture destination. One per workspace; see schema.ts and the 0003 migration. */
export const INBOX_NAME = 'Inbox'

export type Project = typeof projects.$inferSelect

/**
 * A project as the LIST returns it: the row plus `openTasks`, the number of its tasks that are
 * neither finished, cancelled nor deleted. It closes D47 (the project list showed nothing but
 * names) and it is what the left rail puts beside each destination.
 */
export type ProjectListRow = Project & { openTasks: number }

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
 * Lists a workspace's projects ordered inbox-first, then `(rank, id)`. By default archived projects are hidden;
 * `archived: true` lists them instead. Soft-deleted projects never appear.
 */
export async function listProjects(
  q: Queryable,
  workspaceId: string,
  opts: { archived: boolean },
): Promise<ProjectListRow[]> {
  const rows = await q
    .select({
      project: projects,
      // A correlated subquery, so this is still ONE round trip for the whole list -- the same
      // rule `listToday` and `listCompleted` hold to. Counting in the client would mean
      // fetching every task of every project just to render a number.
      // "Open" is defined by exclusion: a status this app has not invented yet is open until
      // someone says otherwise, which is the safe direction for a count of outstanding work.
      // Written with literal, ALIASED table names rather than `${tasks.projectId}` and the
      // like (the style the raw queries in today.ts and completed.ts already use): drizzle
      // interpolates a column reference UNQUALIFIED, so `${tasks.projectId} = ${projects.id}`
      // renders as `"project_id" = "id"`, where `"id"` binds to the subquery's own `tasks`
      // row. That correlates a task to itself, is always false, and silently counts zero.
      openTasks: sql<number>`(
        select count(*) from tasks open_t
        where open_t.project_id = projects.id
          and open_t.deleted_at is null
          and open_t.status not in ('done', 'cancelled')
      )`.mapWith(Number),
    })
    .from(projects)
    .where(
      and(
        visible(workspaceId),
        opts.archived ? isNotNull(projects.archivedAt) : isNull(projects.archivedAt),
      ),
    )
    // Inbox first, then the user's own order. `desc` on a boolean puts true first.
    .orderBy(desc(projects.isInbox), asc(projects.rank), asc(projects.id))
  return rows.map(({ project, openTasks }) => ({ ...project, openTasks }))
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
  // Archiving the inbox hides it from the default project list, which breaks quick capture just
  // as deleting it would. Rename and unarchive stay allowed: the inbox is found by its flag, not
  // its name, and refusing `archived: false` would be a trap.
  if (patch.archived === true) {
    const [existing] = await q
      .select({ isInbox: projects.isInbox })
      .from(projects)
      .where(and(visible(workspaceId), eq(projects.id, id)))
    if (existing?.isInbox) throw new InboxNotDeletableError()
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
  // Checked in the service, not the route: the UI hides the delete control, but a UI is not a
  // constraint. One statement so a concurrent rename cannot slip between check and delete.
  const rows = await q
    .update(projects)
    .set({ deletedAt: sql`now()` })
    .where(and(visible(workspaceId), eq(projects.id, id), eq(projects.isInbox, false)))
    .returning({ id: projects.id })
  if (rows.length === 0) {
    // Distinguish "is the inbox" from "does not exist" with one extra read, only on the
    // failure path.
    const [existing] = await q
      .select({ isInbox: projects.isInbox })
      .from(projects)
      .where(and(visible(workspaceId), eq(projects.id, id)))
    if (existing?.isInbox) throw new InboxNotDeletableError()
    throw new ProjectNotFoundError()
  }
}
