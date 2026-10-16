import {
  type CreateReadingItemBody,
  type UpdateReadingItemBody,
  type WorkspaceId,
  type ReadingId,
  readingId,
} from '@ctws/contracts'
import { newId } from '../../platform/db/ids'
import { eq, sql } from 'drizzle-orm'
import type { Db } from '../../platform/db/client'
import { scoped, within } from '../../platform/db/scope'
import { assertProjectsVisible } from '../../shell/projects/queries'
import { ReadingItemNotFoundError, WrongKindError } from './errors'
import { getReadingItem, lockReadingItem, readingFiling, type ReadingItemRow } from './queries'
import { readingItems } from './tables'
import type { Unfurl } from './unfurl/unfurl'

/** How the reading module reaches the outside world. */
export type ReadingDeps = { unfurl: Unfurl; enabled: boolean }

export async function createReadingItem(
  db: Db,
  workspaceId: WorkspaceId,
  body: CreateReadingItemBody,
): Promise<ReadingItemRow> {
  const values =
    body.kind === 'link'
      ? { kind: 'link' as const, url: body.url, title: null }
      : { kind: 'book' as const, url: null, title: body.title }
  const [created] = await db
    .insert(readingItems)
    // The list itself is the inbox, so everything starts as to read.
    .values({ id: newId(readingId), workspaceId, status: 'todo', ...values })
    .returning({ id: readingItems.id })
  return getReadingItem(db, workspaceId, created!.id)
}

export async function updateReadingItem(
  db: Db,
  workspaceId: WorkspaceId,
  id: ReadingId,
  patch: UpdateReadingItemBody,
): Promise<ReadingItemRow> {
  return db.transaction(async (tx) => {
    const current = await lockReadingItem(tx, workspaceId, id)
    // The other kind's fields: the table's check would refuse them too, but as a bare 500.
    if (patch.url !== undefined && current.kind !== 'link') throw new WrongKindError('url', 'book')
    if (patch.author !== undefined && current.kind !== 'book') {
      throw new WrongKindError('author', 'link')
    }
    // An untitled link shows its host; an untitled book is not a book.
    if (patch.title === null && current.kind === 'book') {
      throw new WrongKindError('empty title', 'book')
    }
    if (patch.projectId) await assertProjectsVisible(tx, workspaceId, [patch.projectId])

    const { projectId, ...fields } = patch
    await tx
      .update(readingItems)
      .set({ ...fields, updatedAt: sql`now()` })
      .where(within(scoped(readingItems, workspaceId), eq(readingItems.id, id)))
    // `null` unfiles the item; absent leaves it where it is.
    if (projectId !== undefined) {
      await readingFiling.put(tx, { workspaceId, id, projectIds: projectId ? [projectId] : [] })
    }
    return getReadingItem(tx, workspaceId, id)
  })
}

export async function softDeleteReadingItem(
  db: Db,
  workspaceId: WorkspaceId,
  id: ReadingId,
): Promise<void> {
  const deleted = await db
    .update(readingItems)
    .set({ deletedAt: sql`now()` })
    .where(within(scoped(readingItems, workspaceId), eq(readingItems.id, id)))
    .returning({ id: readingItems.id })
  if (deleted.length === 0) throw new ReadingItemNotFoundError()
}

/**
 * Fetches a new link's own title after the item is committed, so a slow or silent site never loses
 * the capture.
 */
export async function withFetched(
  deps: ReadingDeps,
  db: Db,
  workspaceId: WorkspaceId,
  row: ReadingItemRow,
): Promise<ReadingItemRow> {
  if (!deps.enabled || row.kind !== 'link') return row
  // The table's shape check gives every link a url.
  const facts = await deps.unfurl(row.url!).catch(() => null)
  if (!facts) return row
  await db
    .update(readingItems)
    .set({ fetchedTitle: facts.title, fetchedSummary: facts.summary })
    .where(within(scoped(readingItems, workspaceId), eq(readingItems.id, row.id)))
  return getReadingItem(db, workspaceId, row.id)
}
