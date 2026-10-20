import { z } from 'zod'
import { instant } from './common'
import { objectId, relationId } from './id'
import { objectType } from './object'

/**
 * A thing's timeline (FR-045): what happened to it, and what was said, held or written about it,
 * newest first. Each entry is one of these kinds; a module that keeps a kind of entry (messages,
 * meetings, notes) adds its own shape here as it arrives.
 */
const TIMELINE_KINDS = ['change', 'message', 'meeting', 'note', 'mention'] as const
export type TimelineKind = (typeof TIMELINE_KINDS)[number]

/** One recorded change to the thing itself: the log's own row, as the module logged it. */
const changeEntry = z.object({
  kind: z.literal('change'),
  id: objectId,
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

/** One occurrence of a meeting the thing was in: a person attended it, a project held it. */
const meetingEntry = z.object({
  kind: z.literal('meeting'),
  at: instant,
  meeting: z.object({
    meetingId: objectId,
    recurrenceId: z.string(),
    title: z.string(),
    durationMinutes: z.number().int().positive(),
    timeZone: z.string(),
    attendees: z.array(z.object({ id: objectId, name: z.string() })),
  }),
})

/** A note hung on the thing (FR-045, FR-050). */
const noteEntry = z.object({
  kind: z.literal('note'),
  at: instant,
  note: z.object({
    id: objectId,
    title: z.string().nullable(),
    excerpt: z.string(),
    words: z.number().int().nonnegative(),
    /** For a note on one occurrence of a meeting. */
    occurrenceId: z.string().nullable(),
  }),
})

/** Somewhere the thing was mentioned: the sentence, and what it was written in (FR-042). */
const mentionEntry = z.object({
  kind: z.literal('mention'),
  relationId,
  at: instant,
  from: z.object({ type: objectType, id: objectId, title: z.string() }),
  excerpt: z.string(),
})

const timelineEntry = z.discriminatedUnion('kind', [
  changeEntry,
  messageEntry,
  meetingEntry,
  noteEntry,
  mentionEntry,
])
export type TimelineEntry = z.infer<typeof timelineEntry>

/** How many entries a page holds; the timeline is read a segment at a time (FR-015). */
const TIMELINE_PAGE = 100

/**
 * Where the next page starts: the last entry shown, so an entry logged while the reader scrolls
 * shifts nothing. Opaque to callers: they hand back what `nextCursor` said and never build one.
 */
const timelineCursor = z.string().min(1).max(200)

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
    limit: z.coerce.number().int().min(1).max(TIMELINE_PAGE).default(TIMELINE_PAGE),
    cursor: timelineCursor.optional(),
  })
  .strict()

export const timelineResponse = z.object({
  entries: z.array(timelineEntry),
  page: z.object({ limit: z.number().int().positive(), nextCursor: timelineCursor.nullable() }),
})
