import {
  type CreateProjectBody,
  type ProjectColor,
  projectColors,
  type UpdateProjectBody,
  type WorkspaceId,
  type ProjectId,
  projectId,
} from '@ctws/contracts'
import { newId } from '../../platform/db/ids'
import { rankBetween } from '@ctws/core'
import { desc, eq, sql } from 'drizzle-orm'
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core'
import type { Db, Queryable, Tx } from '../../platform/db/client'
import { scoped, within } from '../../platform/db/scope'
import { InboxProtectedError, ProjectNotFoundError } from './errors'
import { projects, type Project } from './tables'

/** The quick-capture destination, one per workspace. */
const INBOX_NAME = 'Inbox'

/** First free slot, so the first six projects get six colours; archived projects keep theirs. */
function firstFreeColor(taken: readonly ProjectColor[]): ProjectColor {
  const used = new Set(taken)
  return projectColors.find((c) => !used.has(c)) ?? projectColors[0]
}

async function lockVisibleProject(
  q: Tx,
  workspaceId: WorkspaceId,
  id: ProjectId,
): Promise<Project> {
  const [row] = await q
    .select()
    .from(projects)
    .where(within(scoped(projects, workspaceId), eq(projects.id, id)))
    .for('update')
  if (!row) throw new ProjectNotFoundError()
  return row
}

/** Created with the workspace, so capture never has to create it on the fly. */
export async function createInbox(tx: Queryable, workspaceId: WorkspaceId): Promise<void> {
  await tx.insert(projects).values({
    id: newId(projectId),
    workspaceId,
    name: INBOX_NAME,
    rank: rankBetween(null, null),
    color: projectColors[0],
    isInbox: true,
  })
}

/** Appends a project after the last one; archived projects count for rank and colour. */
export async function createProject(
  db: Db,
  workspaceId: WorkspaceId,
  input: CreateProjectBody,
): Promise<Project> {
  return db.transaction(async (tx) => {
    const [last] = await tx
      .select({ rank: projects.rank })
      .from(projects)
      .where(scoped(projects, workspaceId))
      .orderBy(desc(projects.rank), desc(projects.id))
      .limit(1)
    const taken = await tx
      .select({ color: projects.color })
      .from(projects)
      .where(scoped(projects, workspaceId))

    const [row] = await tx
      .insert(projects)
      .values({
        id: newId(projectId),
        workspaceId,
        name: input.name,
        color: firstFreeColor(taken.map((t) => t.color)),
        rank: rankBetween(last?.rank ?? null, null),
      })
      .returning()
    return row!
  })
}

export async function updateProject(
  db: Db,
  workspaceId: WorkspaceId,
  id: ProjectId,
  patch: UpdateProjectBody,
): Promise<Project> {
  return db.transaction(async (tx) => {
    const existing = await lockVisibleProject(tx, workspaceId, id)
    // An archived inbox would drop out of the list capture reads; renaming it is fine.
    if (patch.archived === true && existing.isInbox) throw new InboxProtectedError()

    const set: PgUpdateSetSource<typeof projects> = {}
    if (patch.name !== undefined) set.name = patch.name
    if (patch.color !== undefined) set.color = patch.color
    // Re-archiving keeps the original timestamp.
    if (patch.archived === true) set.archivedAt = sql`coalesce(${projects.archivedAt}, now())`
    if (patch.archived === false) set.archivedAt = null
    if (Object.keys(set).length === 0) return existing

    const [row] = await tx.update(projects).set(set).where(eq(projects.id, id)).returning()
    return row!
  })
}

/** Soft delete: the row stays so the event log never points at nothing. */
export async function softDeleteProject(
  db: Db,
  workspaceId: WorkspaceId,
  id: ProjectId,
): Promise<void> {
  await db.transaction(async (tx) => {
    const existing = await lockVisibleProject(tx, workspaceId, id)
    if (existing.isInbox) throw new InboxProtectedError()
    await tx
      .update(projects)
      .set({ deletedAt: sql`now()` })
      .where(eq(projects.id, id))
  })
}
