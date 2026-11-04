import {
  fileId as fileIdSchema,
  type FileId,
  type ResourceId,
  type WorkspaceId,
} from '@ctws/contracts'
import { asc, eq, or } from 'drizzle-orm'
import type { Db } from '../../platform/db/client'
import { newId } from '../../platform/db/ids'
import { iconFrom, pictureFrom } from '../../platform/images'
import { type Allow, fetchOutside, type FetchShape } from '../../platform/outbound/fetch'
import { PAGE, readPage, type PageFacts } from '../../platform/outbound/page'
import type { ObjectStore } from '../../platform/storage'
import { letGo } from '../files/service'
import { files } from '../files/tables'
import { resources } from './tables'

/**
 * A resource's card, read from the page it points at in the background: a resource is a link the
 * moment it is added, and a card once this is done. Pictures are fetched here and made anew, so
 * a page shown here never loads anything from the other site, and the other site never sees who
 * is looking. Every fetch goes through the outbound guards; with fetching off, nothing is made.
 */

/** How the outside is reached; tests pass one that may reach this machine. */
export type Previewer = {
  page(url: string): Promise<{ facts: PageFacts } | null>
  /** The bytes at `url`, if they are an image no bigger than `maxBytes`. */
  image(url: string, maxBytes: number): Promise<Buffer | null>
}

/** A page's budget, as a pasted reading link has; a picture gets as long again. */
const BUDGET_MS = 2000
const ICON_MAX_BYTES = 64 * 1024
const PICTURE_MAX_BYTES = 1024 * 1024

const IMAGE: Omit<FetchShape, 'maxBytes'> = {
  accept: 'image/*',
  // The type is a hint here; what the bytes are is decided from the bytes.
  types: /^\s*(image\/|application\/octet-stream)/i,
  larger: 'refuse',
}

/** The previewer that reaches the outside, past the guards. */
export function outsidePreviewer(opts: { allow?: Allow } = {}): Previewer {
  const guard = { timeoutMs: BUDGET_MS, ...(opts.allow ? { allow: opts.allow } : {}) }
  return {
    async page(url) {
      const got = await fetchOutside(url, PAGE, guard)
      return got ? { facts: readPage(got.body, got.charset, got.url) } : null
    },
    async image(url, maxBytes) {
      const got = await fetchOutside(url, { ...IMAGE, maxBytes }, guard)
      return got?.body ?? null
    },
  }
}

/** Keeps a made picture as a file of the resource's workspace; null when there is nowhere. */
async function keep(
  db: Db,
  store: ObjectStore | null,
  workspaceId: WorkspaceId,
  webp: Buffer | null,
  now: Date,
): Promise<FileId | null> {
  if (!store || !webp) return null
  const id = newId(fileIdSchema)
  const key = `previews/${workspaceId}/${id}.webp`
  await store.put(key, webp, 'image/webp')
  await db.insert(files).values({ id, workspaceId, key, createdAt: now })
  return id
}

/**
 * Reads one resource's card and writes it, replacing what it had; the old pictures are let go.
 * A page that gives nothing leaves the resource a plain link (`none`). A resource changed while
 * this ran (its address edited) is left for its own new fetch.
 */
export async function previewOne(
  db: Db,
  store: ObjectStore | null,
  previewer: Previewer,
  id: ResourceId,
  now: () => Date,
): Promise<void> {
  const [row] = await db.select().from(resources).where(eq(resources.id, id))
  if (!row) return
  const page = await previewer.page(row.url).catch(() => null)
  const facts = page?.facts
  const icon =
    facts?.icon && store
      ? await previewer
          .image(facts.icon, ICON_MAX_BYTES)
          .then((b) => (b ? iconFrom(b) : null))
          .catch(() => null)
      : null
  const picture =
    facts?.image && store
      ? await previewer
          .image(facts.image, PICTURE_MAX_BYTES)
          .then((b) => (b ? pictureFrom(b) : null))
          .catch(() => null)
      : null
  const iconId = await keep(db, store, row.workspaceId, icon, now())
  const imageId = await keep(db, store, row.workspaceId, picture, now())
  const something = Boolean(facts?.title || facts?.siteName || iconId || imageId)

  await db.transaction(async (tx) => {
    const [current] = await tx.select().from(resources).where(eq(resources.id, id)).for('update')
    // Gone, or pointed elsewhere meanwhile: what was fetched is for an address it no longer has.
    if (!current || current.url !== row.url) {
      await letGo(tx, now(), [iconId, imageId])
      return
    }
    await tx
      .update(resources)
      .set({
        previewState: something ? 'done' : 'none',
        previewTitle: facts?.title ?? null,
        previewSite: facts?.siteName ?? null,
        iconId,
        imageId,
      })
      .where(eq(resources.id, id))
    await letGo(tx, now(), [current.iconId, current.imageId])
  })
}

/** How many waiting cards one round fetches: a backlog fills in over minutes, not in a burst. */
const BATCH = 5

/** Fetches the cards still waiting, oldest first. */
export async function previewPending(
  db: Db,
  store: ObjectStore | null,
  previewer: Previewer,
  now: () => Date,
): Promise<void> {
  const waiting = await db
    .select({ id: resources.id })
    .from(resources)
    .where(eq(resources.previewState, 'pending'))
    .orderBy(asc(resources.createdAt), asc(resources.id))
    .limit(BATCH)
  for (const r of waiting) await previewOne(db, store, previewer, r.id, now)
}

/**
 * A picture asked for and missing from the store: the resources that showed it go back to
 * waiting, so the card is fetched again; until then the page shows the plain link.
 */
export async function refetchFor(db: Db, file: FileId): Promise<void> {
  await db
    .update(resources)
    .set({ previewState: 'pending' })
    .where(or(eq(resources.iconId, file), eq(resources.imageId, file)))
}
