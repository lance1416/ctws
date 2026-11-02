import {
  type NoteFolderBody,
  type NoteFolderId,
  noteFolderId,
  type NoteFolderPatch,
  type WorkspaceId,
} from '@ctws/contracts'
import { depthOf, FOLDER_DEPTH, freeName, mayGoInto } from '@ctws/core'
import { and, asc, eq, isNull, ne } from 'drizzle-orm'
import type { Db, Queryable, Tx } from '../../platform/db/client'
import { newId } from '../../platform/db/ids'
import { type Actor, scoped, within } from '../../platform/db/scope'
import { DomainError, NotFound } from '../../platform/errors'
import { type NoteFolder, noteFolders, notes } from './tables'

/** A folder's name is its own among the folders beside it: two "Ideas" could not be told apart. */
class NameTaken extends DomainError {
  constructor(name: string) {
    super('conflict', { detail: `There is already a folder called ${name}` })
  }
}

/** Folders go three deep (FR-117), and a folder never goes inside itself. */
class TooDeep extends DomainError {
  constructor() {
    super('conflict', { detail: 'Folders go three deep' })
  }
}

/** Every folder, by name (FR-110): the client lays them out as the tree. */
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

const inParent = (parentId: NoteFolderId | null) =>
  parentId === null ? isNull(noteFolders.parentId) : eq(noteFolders.parentId, parentId)

async function refuseTaken(
  tx: Tx,
  ctx: Actor,
  parentId: NoteFolderId | null,
  name: string,
  except?: NoteFolderId,
) {
  const [taken] = await tx
    .select({ id: noteFolders.id })
    .from(noteFolders)
    .where(
      within(
        scoped(noteFolders, ctx.workspaceId),
        and(
          inParent(parentId),
          eq(noteFolders.name, name),
          except ? ne(noteFolders.id, except) : undefined,
        ),
      ),
    )
  if (taken) throw new NameTaken(name)
}

export function createFolder(db: Db, ctx: Actor, body: NoteFolderBody): Promise<NoteFolder> {
  return db.transaction(async (tx) => {
    const parentId = body.parentId ?? null
    if (parentId !== null) {
      await folderOf(tx, ctx.workspaceId, parentId)
      const all = await listFolders(tx, ctx.workspaceId)
      if (depthOf(all, parentId) >= FOLDER_DEPTH) throw new TooDeep()
    }
    await refuseTaken(tx, ctx, parentId, body.name)
    const [row] = await tx
      .insert(noteFolders)
      .values({
        id: newId(noteFolderId),
        workspaceId: ctx.workspaceId,
        parentId,
        name: body.name,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      })
      .returning()
    return row!
  })
}

/**
 * Renames a folder, moves it with all it holds (FR-117), or opens or closes it in the sidebar.
 * Opening is no edit: its edited time stays.
 */
export function updateFolder(
  db: Db,
  ctx: Actor,
  id: NoteFolderId,
  patch: NoteFolderPatch,
): Promise<NoteFolder> {
  return db.transaction(async (tx) => {
    const was = await folderOf(tx, ctx.workspaceId, id)
    const parentId = patch.parentId === undefined ? was.parentId : patch.parentId
    const name = patch.name ?? was.name
    const moved = parentId !== was.parentId
    if (moved && parentId !== null) {
      await folderOf(tx, ctx.workspaceId, parentId)
      if (!mayGoInto(await listFolders(tx, ctx.workspaceId), id, parentId)) throw new TooDeep()
    }
    const edited = moved || name !== was.name
    if (edited) await refuseTaken(tx, ctx, parentId, name, id)
    const [row] = await tx
      .update(noteFolders)
      .set({
        parentId,
        name,
        ...(patch.open === undefined ? {} : { open: patch.open }),
        ...(edited ? { updatedAt: ctx.now } : {}),
      })
      .where(eq(noteFolders.id, id))
      .returning()
    return row!
  })
}

/**
 * Deletes a folder (FR-117): the folders and notes in it move up a level, nothing goes with it. A
 * folder moving up whose name is taken there takes the first number free ("Talks 2").
 */
export async function deleteFolder(db: Db, ctx: Actor, id: NoteFolderId): Promise<void> {
  await db.transaction(async (tx) => {
    const gone = await folderOf(tx, ctx.workspaceId, id)
    const all = await listFolders(tx, ctx.workspaceId)
    const taken = new Set(
      all.filter((f) => f.parentId === gone.parentId && f.id !== id).map((f) => f.name),
    )
    // Its own name is free for what moves up into its place: it gives it up first.
    await tx.update(noteFolders).set({ name: id }).where(eq(noteFolders.id, id))
    for (const child of all.filter((f) => f.parentId === id)) {
      const name = freeName(child.name, taken)
      taken.add(name)
      await tx
        .update(noteFolders)
        .set({ parentId: gone.parentId, name, updatedAt: ctx.now })
        .where(eq(noteFolders.id, child.id))
    }
    await tx
      .update(notes)
      .set({ folderId: gone.parentId })
      .where(within(scoped(notes, ctx.workspaceId), eq(notes.folderId, id)))
    await tx.delete(noteFolders).where(eq(noteFolders.id, id))
  })
}
