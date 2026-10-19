import { z } from 'zod'
import { instant } from './common'
import { objectId } from './id'
import { objectType } from './object'
import { pageInfo, pageQuery } from './page'

/**
 * A thing's timeline (FR-045): what happened to it, and what was said, held or written about it,
 * newest first. Each entry is one of these kinds; a module that keeps a kind of entry (messages,
 * meetings, notes) adds its own shape here as it arrives.
 */
const TIMELINE_KINDS = ['change', 'message'] as const
export type TimelineKind = (typeof TIMELINE_KINDS)[number]

/** One recorded change to the thing itself: the log's own row, as the module logged it. */
const changeEntry = z.object({
  kind: z.literal('change'),
  at: instant,
  event: z.object({ type: z.string(), payload: z.unknown() }),
})

/** A message sent to or received from the thing, or logged under its project (FR-045). */
const messageEntry = z.object({
  kind: z.literal('message'),
  at: instant,
  message: z.object({
    id: objectId,
    direction: z.enum(['sent', 'received']),
    channel: z.string(),
    subject: z.string().nullable(),
    /** The first of the body, for the row. */
    excerpt: z.string().nullable(),
    parties: z.array(z.object({ type: z.enum(['person', 'organisation']), id: objectId })),
    repliedBy: objectId.nullable(),
  }),
})

const timelineEntry = z.discriminatedUnion('kind', [changeEntry, messageEntry])
export type TimelineEntry = z.infer<typeof timelineEntry>

/** How many entries a page holds; the timeline is read a segment at a time (FR-015). */
const TIMELINE_PAGE = 100

const kindList = z
  .string()
  .transform((list) => list.split(','))
  .pipe(z.array(z.enum(TIMELINE_KINDS)).min(1))

/** The thing whose timeline is asked for, which kinds of entry, and which page. */
export const timelineQuery = z
  .object({
    type: objectType,
    id: objectId,
    /** Every kind when left out. */
    kinds: kindList.optional(),
    ...pageQuery(TIMELINE_PAGE),
  })
  .strict()

export const timelineResponse = z.object({ entries: z.array(timelineEntry), page: pageInfo })
