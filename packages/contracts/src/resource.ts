import { z } from 'zod'
import { instant, patchOf } from './common'
import { objectId, resourceId } from './id'
import { objectType } from './object'

/**
 * A resource is an outside address any thing can carry (FR-046): a document, a pull request, a
 * folder. It has an optional name of its own; what it is (a Google Doc, "#123") is read from the
 * address by the client. A project may pin a few of its resources in its head, numbered 1 to 9.
 */

// http(s) only: the row renders the address as a link somebody will click.
const resourceUrl = z
  .url()
  .max(2000)
  .refine((u) => /^https?:\/\//i.test(u), { message: 'expected an http(s) url' })
const resourceName = z.string().trim().min(1).max(200)

/** How many resources a project may pin: one per digit key. */
const MAX_PINNED = 9
const pinnedRank = z.number().int().min(1).max(MAX_PINNED)

const owner = z.object({ type: objectType, id: objectId }).strict()

export const resourceParams = z.object({ id: resourceId }).strict()

export const createResourceBody = z
  .object({ owner, url: resourceUrl, name: resourceName.nullish() })
  .strict()

/** A resource's own fields; `pinnedRank` is only for a project's, null unpins. */
export const updateResourceBody = patchOf({
  url: resourceUrl,
  name: resourceName.nullable(),
  pinnedRank: pinnedRank.nullable(),
})

export type UpdateResourceBody = z.infer<typeof updateResourceBody>

export const resourceResponse = z.object({
  id: resourceId,
  owner,
  url: z.string(),
  name: z.string().nullable(),
  /** The order among its owner's resources. */
  rank: z.string(),
  pinnedRank: z.number().int().nullable(),
  createdAt: instant,
})
export type ResourceResponse = z.infer<typeof resourceResponse>

/** The thing whose resources are asked for. */
export const resourcesQuery = owner

export const resourcesResponse = z.object({ resources: z.array(resourceResponse) })
