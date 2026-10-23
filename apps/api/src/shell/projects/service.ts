import {
  type CreateProjectBody,
  projectColors,
  type UpdateProjectBody,
  type ProjectId,
  projectId,
  type WorkspaceId,
} from '@ctws/contracts'
import { newId } from '../../platform/db/ids'
import { initialsOf, leastUsedColor, rankBetween } from '@ctws/core'
import { desc, eq, sql } from 'drizzle-orm'
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core'
import { eventLog } from '../events'
import { bury, type Grave } from '../tombstones'
import type { Db, Queryable, Tx } from '../../platform/db/client'
import { type Actor, scoped } from '../../platform/db/scope'
import { instant } from '../../platform/db/time'
import { InboxProtectedError } from './errors'
import { lockProject } from './queries'
import { projects, type Project } from './tables'

/** The quick-capture destination, one per workspace. */
const INBOX_NAME = 'Inbox'

/** Created with the workspace, so capture never has to create it on the fly. */
export async function createInbox(tx: Queryable, { workspaceId, now }: Actor): Promise<void> {
  await tx.insert(projects).values({
    createdAt: now,
    id: newId(projectId),
    workspaceId,
    name: INBOX_NAME,
    initials: initialsOf(INBOX_NAME),
    rank: rankBetween(null, null),
    color: projectColors[0],
    isInbox: true,
  })
}

/** Appends a project after the last one; archived projects count for rank and colour. */
export async function createProject(
  db: Db,
  { workspaceId, now }: Actor,
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
        color: input.color ?? leastUsedColor(taken.map((t) => t.color)),
        initials: input.initials ?? initialsOf(input.name),
        rank: rankBetween(last?.rank ?? null, null),
        createdAt: now,
      })
      .returning()
    await eventLog(tx, { workspaceId, now }).append({ type: 'project', id: row!.id }, 'created', {
      to: { name: input.name },
    })
    return row!
  })
}

export async function updateProject(
  db: Db,
  { workspaceId, now }: Actor,
  id: ProjectId,
  patch: UpdateProjectBody,
): Promise<Project> {
  return db.transaction(async (tx) => {
    const existing = await lockProject(tx, workspaceId, id)
    // An archived inbox would drop out of the list capture reads; renaming it is fine.
    if (patch.archived === true && existing.isInbox) throw new InboxProtectedError()

    const set: PgUpdateSetSource<typeof projects> = {}
    if (patch.name !== undefined) set.name = patch.name
    if (patch.color !== undefined) set.color = patch.color
    if (patch.initials !== undefined) set.initials = patch.initials
    // Re-archiving keeps the original timestamp.
    if (patch.archived === true)
      set.archivedAt = sql`coalesce(${projects.archivedAt}, ${instant(now)})`
    if (patch.archived === false) set.archivedAt = null
    if (Object.keys(set).length === 0) return existing

    const [row] = await tx.update(projects).set(set).where(eq(projects.id, id)).returning()
    const log = eventLog(tx, { workspaceId, now })
    for (const field of ['name', 'color', 'initials'] as const) {
      if (patch[field] !== undefined && patch[field] !== existing[field]) {
        await log.append({ type: 'project', id }, 'field_changed', {
          field,
          from: existing[field],
          to: patch[field],
        })
      }
    }
    const wasArchived = existing.archivedAt !== null
    if (patch.archived !== undefined && patch.archived !== wasArchived) {
      await log.append({ type: 'project', id }, 'field_changed', {
        field: 'archived',
        from: wasArchived,
        to: patch.archived,
      })
    }
    return row!
  })
}

/**
 * Deletes a project and every task in it, for good (FR-035): a tombstone each, then the rows go.
 * What was filed in it from other modules (meetings, reading, people, messages) stays, unfiled,
 * by their foreign keys. `graves` is how the tasks module names its tasks' tombstones: the shell
 * cannot read a module's table.
 */
export type ProjectGraves = (
  tx: Tx,
  workspaceId: WorkspaceId,
  projectId: ProjectId,
) => Promise<Grave[]>

export async function deleteProject(
  db: Db,
  ctx: Actor,
  id: ProjectId,
  graves: ProjectGraves,
): Promise<void> {
  const { workspaceId } = ctx
  await db.transaction(async (tx) => {
    const existing = await lockProject(tx, workspaceId, id)
    if (existing.isInbox) throw new InboxProtectedError()
    const tasks = await graves(tx, workspaceId, id)
    await bury(tx, ctx, [...tasks, { type: 'project', id, title: existing.name }])
    await tx.execute(sql`delete from tasks where project_id = ${id}`)
    await tx.delete(projects).where(eq(projects.id, id))
  })
}
