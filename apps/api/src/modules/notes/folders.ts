import {
  type NoteFolderBody,
  type NoteFolderId,
  noteFolderId,
  type WorkspaceId,
} from '@ctws/contracts'
import { and, asc, eq, ne } from 'drizzle-orm'
import type { Db, Queryable, Tx } from '../../platform/db/client'
import { newId } from '../../platform/db/ids'
import { type Actor, scoped, within } from '../../platform/db/scope'
import { DomainError, NotFound } from '../../platform/errors'
import { type NoteFolder, noteFolders } from './tables'

/** A folder's name is its own in the workspace: two "Ideas" could not be told apart. */
class NameTaken extends DomainError {
  constructor(name: string) {
    super('conflict', { detail: `There is already a folder called ${name}` })
  }
}

/** Every folder, by name (FR-110). */
export function listFolders(q: Queryable, workspaceId: WorkspaceId): Promise<NoteFolder[]> {
  return q
    .select()
    .from(noteFolders)
    .where(scoped(noteFolders, workspaceId))
    .orderBy(asc(noteFolders.name), asc(noteFolders.id))
}

/** The folder, when it is this workspace's. */
export async function folderOf(
  q: Queryable,
  workspaceId: WorkspaceId,
  id: NoteFolderId,
): Promise<NoteFolder> {
  const [row] = await q
    .select()
    .from(noteFolders)
    .where(within(scoped(noteFolders, workspaceId), eq(noteFolders.id, id)))
  if (!row) throw new NotFound('Folder')
  return row
}

async function refuseTaken(tx: Tx, ctx: Actor, name: string, except?: NoteFolderId) {
  const [taken] = await tx
    .select({ id: noteFolders.id })
    .from(noteFolders)
    .where(
      within(
        scoped(noteFolders, ctx.workspaceId),
        and(eq(noteFolders.name, name), except ? ne(noteFolders.id, except) : undefined),
      ),
    )
  if (taken) throw new NameTaken(name)
}

export function createFolder(db: Db, ctx: Actor, body: NoteFolderBody): Promise<NoteFolder> {
  return db.transaction(async (tx) => {
    await refuseTaken(tx, ctx, body.name)
    const [row] = await tx
      .insert(noteFolders)
      .values({
        id: newId(noteFolderId),
        workspaceId: ctx.workspaceId,
        name: body.name,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      })
      .returning()
    return row!
  })
}

export function renameFolder(
  db: Db,
  ctx: Actor,
  id: NoteFolderId,
  body: NoteFolderBody,
): Promise<NoteFolder> {
  return db.transaction(async (tx) => {
    const was = await folderOf(tx, ctx.workspaceId, id)
    if (was.name === body.name) return was
    await refuseTaken(tx, ctx, body.name, id)
    const [row] = await tx
      .update(noteFolders)
      .set({ name: body.name, updatedAt: ctx.now })
      .where(eq(noteFolders.id, id))
      .returning()
    return row!
  })
}

/** Deletes a folder; its notes stay, in no folder (the column's own `on delete set null`). */
export async function deleteFolder(db: Db, ctx: Actor, id: NoteFolderId): Promise<void> {
  await db.transaction(async (tx) => {
    await folderOf(tx, ctx.workspaceId, id)
    await tx.delete(noteFolders).where(eq(noteFolders.id, id))
  })
}
