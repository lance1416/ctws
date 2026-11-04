import {
  fileId as fileIdSchema,
  undoToken as undoTokenSchema,
  type FileId,
  type UndoToken,
  type WorkspaceId,
} from '@ctws/contracts'
import { and, eq, gt, lte, sql } from 'drizzle-orm'
import type { Db, Queryable, Tx } from '../../platform/db/client'
import { newId } from '../../platform/db/ids'
import type { Actor } from '../../platform/db/scope'
import { avatarFrom, type Crop } from '../../platform/images'
import type { ObjectStore } from '../../platform/storage'
import { BadCropError, UndoExpiredError, UnsupportedImageError } from './errors'
import { fileDeletes, files } from './tables'

/**
 * How long a photo taken off can be put back. The page's Undo shows for five seconds and stays
 * while the pointer rests on it, so the server gives more than that; the sweep after it runs each
 * minute, so the file is gone within two minutes of the Undo going.
 */
const UNDO_MS = 60_000

/** Who holds a photo, as the caller sees them: an account or a person, by their own column. */
export type Holder = {
  id: string
  /** Points the holder at `next` (or at nothing) and says what it pointed at, or null. */
  swap(tx: Tx, next: FileId | null): Promise<FileId | null>
  /** Points an empty holder at `photo`; false when the holder has one again since. */
  refill(tx: Tx, photo: FileId): Promise<boolean>
}

/** Lets go of a file in `tx`: it goes at `dueAt`, and `ownerId` may take it back until then. */
async function setAside(
  tx: Tx,
  file: FileId,
  opts: { dueAt: Date; ownerId?: string },
): Promise<UndoToken> {
  const id = newId(undoTokenSchema)
  await tx
    .insert(fileDeletes)
    .values({ id, fileId: file, ownerId: opts.ownerId ?? null, dueAt: opts.dueAt })
  return id
}

/**
 * Keeps a photo for `holder`: cut, scaled and encoded anew, written to the store, then made the
 * holder's in one transaction that lets the old one go. The bytes go first, so a row never names
 * a file that is not there; if the transaction fails they are removed again, and if even that
 * fails they are an unnamed key no one can read.
 */
export async function keepPhoto(
  db: Db,
  store: ObjectStore,
  ctx: Actor,
  holder: Holder,
  bytes: Buffer,
  crop: Crop,
): Promise<FileId> {
  const made = await avatarFrom(bytes, crop)
  if (!made.ok) throw made.why === 'bad-crop' ? new BadCropError() : new UnsupportedImageError()
  const id = newId(fileIdSchema)
  const key = `avatars/${ctx.workspaceId}/${id}.webp`
  await store.put(key, made.webp, 'image/webp')
  try {
    await db.transaction(async (tx) => {
      await tx.insert(files).values({ id, workspaceId: ctx.workspaceId, key, createdAt: ctx.now })
      const old = await holder.swap(tx, id)
      if (old) await setAside(tx, old, { dueAt: ctx.now })
    })
  } catch (error) {
    await store.remove(key).catch(() => undefined)
    throw error
  }
  return id
}

/**
 * Takes `holder`'s photo off, keeping it for `UNDO_MS` against the token returned. Null when the
 * holder has none.
 */
export async function takeOffPhoto(db: Db, ctx: Actor, holder: Holder): Promise<UndoToken | null> {
  return db.transaction(async (tx) => {
    const old = await holder.swap(tx, null)
    if (!old) return null
    return setAside(tx, old, {
      dueAt: new Date(ctx.now.getTime() + UNDO_MS),
      ownerId: holder.id,
    })
  })
}

/**
 * Puts back the photo `token` took off `holder`. Refused once the minute is over, when the token
 * was for someone else, or when the holder has another photo since: putting it back would then
 * throw away the newer one.
 */
export async function putBackPhoto(
  db: Db,
  ctx: Actor,
  holder: Holder,
  token: UndoToken,
): Promise<FileId> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ fileId: fileDeletes.fileId })
      .from(fileDeletes)
      .innerJoin(files, eq(files.id, fileDeletes.fileId))
      .where(
        and(
          eq(fileDeletes.id, token),
          eq(fileDeletes.ownerId, holder.id),
          eq(files.workspaceId, ctx.workspaceId),
          gt(fileDeletes.dueAt, ctx.now),
        ),
      )
      .for('update', { of: fileDeletes })
    if (!row || !(await holder.refill(tx, row.fileId))) throw new UndoExpiredError()
    await tx.delete(fileDeletes).where(eq(fileDeletes.id, token))
    return row.fileId
  })
}

/** Lets go, in `tx`, of files whose holders are being deleted there: no Undo puts these back. */
export async function letGo(tx: Tx, now: Date, ids: readonly (FileId | null)[]): Promise<void> {
  for (const id of ids) if (id) await setAside(tx, id, { dueAt: now })
}

/** Where a workspace's file is kept, or null when it has no such file. */
export async function keyOf(
  q: Queryable,
  workspaceId: WorkspaceId,
  id: FileId,
): Promise<string | null> {
  const [row] = await q
    .select({ key: files.key })
    .from(files)
    .where(and(eq(files.id, id), eq(files.workspaceId, workspaceId)))
  return row?.key ?? null
}

// One sweep's share: a backlog (the store down for a day) drains over several minutes rather
// than in one long burst.
const SWEEP_BATCH = 200

/**
 * Removes the files whose time has come: the bytes from the store, then the row, which takes its
 * delete entry with it. One that the store fails to remove stays for the next sweep. Answers how
 * many went.
 */
export async function sweepFiles(db: Db, store: ObjectStore, now: Date): Promise<number> {
  const due = await db
    .select({ id: files.id, key: files.key })
    .from(fileDeletes)
    .innerJoin(files, eq(files.id, fileDeletes.fileId))
    .where(lte(fileDeletes.dueAt, now))
    .orderBy(fileDeletes.dueAt)
    .limit(SWEEP_BATCH)
  let gone = 0
  for (const file of due) {
    try {
      await store.remove(file.key)
    } catch {
      continue
    }
    // Only if it is still due: an Undo may have put it back while the store was answering.
    const removed = await db.execute(sql`
      delete from files f using file_deletes d
      where f.id = ${file.id}::uuid and d.file_id = f.id and d.due_at <= ${now}`)
    gone += removed.rowCount ?? 0
  }
  return gone
}
