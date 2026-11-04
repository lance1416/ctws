import { z } from 'zod'
import { objectId } from './id'
import { linkCandidate } from './link'
import { objectType } from './object'

/**
 * Where a person, a project or an organisation is named in some text without being mentioned:
 * found by its name (and a person's other names), to be turned into a mention or let be.
 */

const UNLINKED_TARGETS = ['person', 'project', 'organisation'] as const

export const unlinkedParams = z.object({ type: z.enum(UNLINKED_TARGETS), id: objectId }).strict()

/** How many are listed; the rest are counted, for "N more". */
export const UNLINKED_LISTED = 20

/** One place, as it was found: in which thing's text, the sentence, and where in it. */
const place = z.object({
  source: z.object({ type: objectType, id: objectId }).strict(),
  excerpt: z.string().min(1).max(2000),
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
})

export const unlinkedResponse = z.object({
  items: z.array(place.extend({ source: linkCandidate })),
  total: z.number().int().nonnegative(),
})

/** "Link" or "Not this one", for the place as it was read. */
export const unlinkedPlaceBody = place.strict()
