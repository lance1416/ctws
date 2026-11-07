import { z } from 'zod'
import { instant, patchOf } from './common'
import { fileId, objectId, resourceId } from './id'
import { objectType } from './object'

/**
 * A resource is an outside address any thing can carry: a document, a pull request, a
 * folder. It has an optional name of its own; what it is (a Google Doc, "#123") is read from the
 * address by the client. A project may pin a few of its resources in its head, numbered 1 to 9.
 */

/**
 * An address typed or pasted without its scheme ("example.com/docs") is https: that is what it is
 * nearly always meant as. One with another scheme ("mailto:", "javascript:") is left to be refused.
 */
const withScheme = (raw: unknown): unknown => {
  if (typeof raw !== 'string') return raw
  const text = raw.trim()
  if (text === '' || /^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return text
  if (/^(mailto|javascript|data|file|tel|blob):/i.test(text)) return text
  return `https://${text.replace(/^\/\//, '')}`
}

// http(s) only: the row renders the address as a link somebody will click.
const resourceUrl = z.preprocess(
  withScheme,
  z
    .url()
    .max(2000)
    .refine((u) => /^https?:\/\//i.test(u), { message: 'expected an http(s) url' }),
)
const resourceName = z.string().trim().min(1).max(200)

/** How many resources a project may pin: one per digit key. */
const MAX_PINNED = 9
const pinnedRank = z.number().int().min(1).max(MAX_PINNED)

const owner = z.object({ type: objectType, id: objectId }).strict()

export const resourceParams = z.object({ id: resourceId }).strict()

export const createResourceBody = z
  .object({ owner, url: resourceUrl, name: resourceName.nullish() })
  .strict()

/**
 * A resource's own fields; `pinnedRank` is only for a project's, null unpins. A drag names the
 * one of its owner's resources it now sits before or after, never both.
 */
export const updateResourceBody = patchOf({
  url: resourceUrl,
  name: resourceName.nullable(),
  pinnedRank: pinnedRank.nullable(),
  beforeId: resourceId,
  afterId: resourceId,
}).refine((b) => b.beforeId === undefined || b.afterId === undefined, {
  message: 'a resource goes before one neighbour or after one, not both',
  path: ['afterId'],
})

export type UpdateResourceBody = z.infer<typeof updateResourceBody>

/** Where a resource's card is: being fetched, there, or not to be had. */
export const PREVIEW_STATES = ['pending', 'done', 'none'] as const
export type PreviewState = (typeof PREVIEW_STATES)[number]

export const resourceResponse = z.object({
  id: resourceId,
  owner,
  url: z.string(),
  name: z.string().nullable(),
  /** The order among its owner's resources. */
  rank: z.string(),
  pinnedRank: z.number().int().nullable(),
  /** The card the page describes; its pictures are read at `/files/:id`. */
  preview: z
    .object({
      title: z.string().nullable(),
      siteName: z.string().nullable(),
      iconId: fileId.nullable(),
      imageId: fileId.nullable(),
    })
    .nullable(),
  previewState: z.enum(PREVIEW_STATES),
  createdAt: instant,
})
export type ResourceResponse = z.infer<typeof resourceResponse>

/** The thing whose resources are asked for. */
export const resourcesQuery = owner

export const resourcesResponse = z.object({ resources: z.array(resourceResponse) })
