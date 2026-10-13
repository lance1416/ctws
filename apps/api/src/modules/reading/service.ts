import type { CreateReadingItemBody, UpdateReadingItemBody } from '@ctws/contracts'
import { and, eq, sql } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import type { Db, Queryable } from '../../platform/db/client'
import { assertProjectsVisible } from '../../shell/projects/queries'
import { ReadingItemNotFoundError, WrongKindError } from './errors'
import { getReadingItem, readingFiling, type ReadingItemRow, visibleItems } from './queries'
import { readingItems } from './tables'
import type { Unfurl } from './unfurl/unfurl'

/** How the reading module reaches the outside world. */
export type ReadingDeps = { unfurl: Unfurl; enabled: boolean }

export async function createReadingItem(
  db: Db,
  workspaceId: string,
  body: CreateReadingItemBody,
): Promise<ReadingItemRow> {
  return db.transaction(async (tx) => {
    await assertProjectsVisible(tx, workspaceId, body.projectId ? [body.projectId] : [])
    const values =
      body.kind === 'link'
        ? { kind: 'link' as const, url: body.url, title: body.title ?? null, author: null }
        : { kind: 'book' as const, url: null, title: body.title, author: body.author ?? null }
    const [created] = await tx
      .insert(readingItems)
      // The list itself is the inbox, so everything starts as to read.
      .values({ id: uuidv7(), workspaceId, status: 'todo', ...values })
      .returning({ id: readingItems.id })
    await readingFiling.put(tx, workspaceId, created!.id, body.projectId ? [body.projectId] : [])
    return getReadingItem(tx, workspaceId, created!.id)
  })
}

export async function updateReadingItem(
  db: Db,
  workspaceId: string,
  id: string,
  patch: UpdateReadingItemBody,
): Promise<ReadingItemRow> {
  return db.transaction(async (tx) => {
    const current = await getReadingItem(tx, workspaceId, id)
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
      .where(and(visibleItems(workspaceId), eq(readingItems.id, id)))
    // `null` unfiles the item; absent leaves it where it is.
    if (projectId !== undefined) {
      await readingFiling.put(tx, workspaceId, id, projectId ? [projectId] : [])
    }
    return getReadingItem(tx, workspaceId, id)
  })
}

export async function softDeleteReadingItem(
  db: Db,
  workspaceId: string,
  id: string,
): Promise<void> {
  const deleted = await db
    .update(readingItems)
    .set({ deletedAt: sql`now()` })
    .where(and(visibleItems(workspaceId), eq(readingItems.id, id)))
    .returning({ id: readingItems.id })
  if (deleted.length === 0) throw new ReadingItemNotFoundError()
}

/**
 * Stores what a fetch found, even nothing: `fetched_at` says it was tried, so no list read tries
 * again.
 */
export async function recordFetched(
  q: Queryable,
  workspaceId: string,
  id: string,
  facts: { title: string | null; summary: string | null },
): Promise<ReadingItemRow> {
  await q
    .update(readingItems)
    .set({ fetchedTitle: facts.title, fetchedSummary: facts.summary, fetchedAt: sql`now()` })
    .where(and(visibleItems(workspaceId), eq(readingItems.id, id)))
  return getReadingItem(q, workspaceId, id)
}

/**
 * Fetches an untitled link's own title after the item is committed, so a slow or silent site
 * never loses the capture.
 */
export async function withFetched(
  deps: ReadingDeps,
  db: Db,
  workspaceId: string,
  row: ReadingItemRow,
): Promise<ReadingItemRow> {
  if (!deps.enabled) return row
  if (row.kind !== 'link' || row.url === null || row.title !== null) return row
  const facts = await deps.unfurl(row.url).catch(() => null)
  return recordFetched(db, workspaceId, row.id, {
    title: facts?.title ?? null,
    summary: facts?.summary ?? null,
  })
}
