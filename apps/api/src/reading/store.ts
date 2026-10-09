import type { CreateReadingItemBody, UpdateReadingItemBody } from '@ctws/contracts'
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import type { Queryable } from '../db/client'
import { filedUnder, oneProjectOf, putLinks, unfiled } from '../links/store'
import { textMatches } from '../db/like'
import { projects, readingItems } from '../db/schema'
import { ProjectNotFoundError } from '../projects/errors'
import { visibleProjects } from '../projects/store'
import { ReadingItemNotFoundError, WrongKindError } from './errors'

/**
 * 待读清单's storage -- THE SECOND MODULE's own.
 *
 * It borrows exactly two things from the shell: the workspace, and `visibleProjects` for deciding
 * which projects an item may be filed under. It borrows nothing from the task module, which is
 * the property the whole module seam exists to have.
 */

type ReadingItem = typeof readingItems.$inferSelect
/** A row as a list returns it: the item plus the shell project's name, so one round trip is enough. */
export type ReadingItemRow = ReadingItem & {
  projectId: string | null
  projectName: string | null
}

/**
 * THE TENANT CHOKEPOINT, this module's own. Every read and write below goes through it, so
 * scoping and soft-delete filtering cannot be forgotten on one path.
 */
function visibleItems(workspaceId: string) {
  return and(eq(readingItems.workspaceId, workspaceId), isNull(readingItems.deletedAt))
}

// The project is an EDGE now, not a column: `oneProjectOf` is the shell's, and every module that
// shows one project reads it the same way.
const withProject = { item: readingItems, ...oneProjectOf('reading', 'reading_items') }

const rowOf = ({
  item,
  projectId,
  projectName,
}: {
  item: ReadingItem
  projectId: string | null
  projectName: string | null
}): ReadingItemRow => ({ ...item, projectId, projectName })

/**
 * A project this workspace may file an item under, or a refusal.
 *
 * A project id from another workspace reads as "no such project" rather than as a refusal that
 * would confirm the id exists -- the same answer the task module gives for the same reason.
 */
async function assertProject(q: Queryable, workspaceId: string, projectId: string): Promise<void> {
  const rows = await q
    .select({ id: projects.id })
    .from(projects)
    .where(and(visibleProjects(workspaceId), eq(projects.id, projectId)))
  if (rows.length === 0) throw new ProjectNotFoundError()
}

export async function listReadingItems(
  q: Queryable,
  workspaceId: string,
  opts: { projectId?: string; unfiled?: boolean; statuses?: readonly string[] } = {},
): Promise<ReadingItemRow[]> {
  const rows = await q
    .select(withProject)
    .from(readingItems)
    .where(
      and(
        visibleItems(workspaceId),
        opts.projectId ? filedUnder('reading', 'reading_items', opts.projectId) : undefined,
        opts.unfiled ? unfiled('reading', 'reading_items') : undefined,
        // An empty list would mean "no status matches", which is never what a caller means; an
        // absent filter means every status.
        opts.statuses && opts.statuses.length > 0
          ? inArray(readingItems.status, [...opts.statuses])
          : undefined,
      ),
    )
    // Newest first. A reading pile has no hand-kept order: the thing you just saved is the thing
    // you are most likely to be looking for.
    .orderBy(desc(readingItems.createdAt), desc(readingItems.id))
  return rows.map(rowOf)
}

async function getReadingItem(
  q: Queryable,
  workspaceId: string,
  id: string,
): Promise<ReadingItemRow> {
  const rows = await q
    .select(withProject)
    .from(readingItems)
    .where(and(visibleItems(workspaceId), eq(readingItems.id, id)))
  const row = rows[0]
  if (!row) throw new ReadingItemNotFoundError()
  return rowOf(row)
}

export async function createReadingItem(
  q: Queryable,
  workspaceId: string,
  body: CreateReadingItemBody,
): Promise<ReadingItemRow> {
  if (body.projectId) await assertProject(q, workspaceId, body.projectId)
  const values =
    body.kind === 'link'
      ? { kind: 'link' as const, url: body.url, title: body.title ?? null, author: null }
      : { kind: 'book' as const, url: null, title: body.title, author: body.author ?? null }
  const [created] = await q
    .insert(readingItems)
    .values({
      id: uuidv7(),
      workspaceId,
      // 待读 is where everything starts. There is no separate inbox for reading: the list IS the
      // inbox, which is why the age of a row is worth showing on it.
      status: 'todo',
      ...values,
    })
    .returning({ id: readingItems.id })
  const id = created!.id
  await putLinks(
    q,
    workspaceId,
    { type: 'reading', id },
    'project',
    'belongs',
    body.projectId ? [body.projectId] : [],
  )
  return getReadingItem(q, workspaceId, id)
}

export async function updateReadingItem(
  q: Queryable,
  workspaceId: string,
  id: string,
  patch: UpdateReadingItemBody,
): Promise<ReadingItemRow> {
  const current = await getReadingItem(q, workspaceId, id)
  // The fields of the other kind. The database's CHECK would refuse these too, but as a
  // constraint violation -- a 500 that tells the client nothing it can act on.
  if (patch.url !== undefined && current.kind !== 'link') throw new WrongKindError('url', 'book')
  if (patch.author !== undefined && current.kind !== 'book') {
    throw new WrongKindError('author', 'link')
  }
  // A link with no title falls back to showing its host; a book with no title is not a book.
  if (patch.title === null && current.kind === 'book') {
    throw new WrongKindError('empty title', 'book')
  }
  if (patch.projectId) await assertProject(q, workspaceId, patch.projectId)

  const { projectId, ...fields } = patch
  await q
    .update(readingItems)
    .set({ ...fields, updatedAt: new Date() })
    .where(and(visibleItems(workspaceId), eq(readingItems.id, id)))
  // `projectId: null` and an absent `projectId` are different answers: one unfiles the item, the
  // other leaves it where it is.
  if (projectId !== undefined) {
    await putLinks(
      q,
      workspaceId,
      { type: 'reading', id },
      'project',
      'belongs',
      projectId ? [projectId] : [],
    )
  }
  return getReadingItem(q, workspaceId, id)
}

export async function softDeleteReadingItem(
  q: Queryable,
  workspaceId: string,
  id: string,
): Promise<void> {
  const deleted = await q
    .update(readingItems)
    .set({ deletedAt: new Date() })
    .where(and(visibleItems(workspaceId), eq(readingItems.id, id)))
    .returning({ id: readingItems.id })
  if (deleted.length === 0) throw new ReadingItemNotFoundError()
}

/**
 * This module's half of federated search: titles, authors and urls.
 *
 * The URL is searched too, because half of what is in here has no title yet and the host is the
 * only thing the person remembers about it.
 */
export async function searchReadingItems(
  q: Queryable,
  workspaceId: string,
  query: string,
  limit = 20,
): Promise<ReadingItemRow[]> {
  const rows = await q
    .select(withProject)
    .from(readingItems)
    .where(
      and(
        visibleItems(workspaceId),
        textMatches(['reading_items.title', 'reading_items.author', 'reading_items.url'], query),
      ),
    )
    .orderBy(desc(readingItems.createdAt), desc(readingItems.id))
    .limit(limit)
  return rows.map(rowOf)
}
