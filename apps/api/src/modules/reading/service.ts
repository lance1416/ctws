import {
  type CreateReadingItemBody,
  type UpdateReadingItemBody,
  type WorkspaceId,
  type ReadingId,
  readingId,
} from '@ctws/contracts'
import { newId } from '../../platform/db/ids'
import { eq } from 'drizzle-orm'
import type { Db } from '../../platform/db/client'
import { type Actor, scoped, within } from '../../platform/db/scope'
import { eventLog } from '../../shell/events'
import { bury } from '../../shell/tombstones'
import type { LinkRegistry } from '../../shell/links'
import { assertProjectsVisible } from '../../shell/projects'
import { WrongKindError } from './errors'
import { getReadingItem, lockReadingItem, type ReadingItemRow } from './queries'

const subject = (id: ReadingId) => ({ type: 'reading' as const, id })
import { readingItems } from './tables'
import type { Unfurl } from './unfurl/unfurl'
import { NotFound } from '../../platform/errors'

/** How the reading module reaches the outside world. */
export type ReadingDeps = { unfurl: Unfurl; enabled: boolean }

export async function createReadingItem(
  db: Db,
  { workspaceId, now }: Actor,
  body: CreateReadingItemBody,
): Promise<ReadingItemRow> {
  const values =
    body.kind === 'link'
      ? { kind: 'link' as const, url: body.url, title: null }
      : { kind: 'book' as const, url: null, title: body.title }
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(readingItems)
      // The list itself is the inbox, so everything starts as to read.
      .values({
        id: newId(readingId),
        workspaceId,
        status: 'todo',
        ...values,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: readingItems.id })
    await eventLog(tx, { workspaceId, now }).append(subject(created!.id), 'created', { to: values })
    return getReadingItem(tx, workspaceId, created!.id)
  })
}

export async function updateReadingItem(
  registry: LinkRegistry,
  db: Db,
  { workspaceId, now }: Actor,
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
    // Who is named, then and now: the timeline says them, and reading does not know people.
    const named = new Map<string, string>()
    const asked = [patch.recommendedById, current.recommendedBy].filter((x) => !!x) as string[]
    if (patch.recommendedById !== undefined && asked.length > 0) {
      const who = await registry.of('person').rows(tx, workspaceId, { ids: asked, limit: 2 })
      for (const p of who) named.set(p.id, p.title)
      if (patch.recommendedById && !named.has(patch.recommendedById)) throw new NotFound('Person')
    }

    const { recommendedById, ...fields } = patch
    const log = eventLog(tx, { workspaceId, now })
    for (const field of ['title', 'url', 'author', 'status', 'projectId', 'planOn'] as const) {
      const next = fields[field]
      if (next !== undefined && next !== current[field]) {
        await log.append(subject(id), 'field_changed', { field, from: current[field], to: next })
      }
    }
    if (recommendedById !== undefined && recommendedById !== current.recommendedBy) {
      await log.append(subject(id), 'field_changed', {
        field: 'recommendedBy',
        from: current.recommendedBy,
        to: recommendedById,
        fromName: current.recommendedBy ? (named.get(current.recommendedBy) ?? null) : null,
        toName: recommendedById ? (named.get(recommendedById) ?? null) : null,
      })
    }
    await tx
      .update(readingItems)
      .set({
        ...fields,
        ...(recommendedById !== undefined ? { recommendedBy: recommendedById } : {}),
        updatedAt: now,
      })
      .where(within(scoped(readingItems, workspaceId), eq(readingItems.id, id)))
    return getReadingItem(tx, workspaceId, id)
  })
}

/** Deletes an item for good (FR-035): a tombstone, and the row goes. */
export async function deleteReadingItem(db: Db, ctx: Actor, id: ReadingId): Promise<void> {
  await db.transaction(async (tx) => {
    const current = await lockReadingItem(tx, ctx.workspaceId, id)
    await bury(tx, ctx, [
      {
        type: 'reading',
        id,
        title: current.title ?? current.fetchedTitle ?? current.url ?? '',
        place: { projectId: current.projectId, projectName: current.projectName },
      },
    ])
    await tx.delete(readingItems).where(eq(readingItems.id, id))
  })
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
