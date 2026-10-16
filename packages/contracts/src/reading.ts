import { z } from 'zod'
import { calendarDate, instant, nameText, titleText } from './common'

/**
 * Reading comes in two kinds: a link has a url, a book has an author and no url. A link's title
 * may be absent, since capturing one is pasting a url; the list shows the address until it is
 * named.
 */

export const READING_KINDS = ['link', 'book'] as const

/** To read, reading, finished, dropped. */
export const READING_STATUSES = ['todo', 'reading', 'done', 'dropped'] as const
const readingStatus = z.enum(READING_STATUSES)
export type ReadingStatus = z.infer<typeof readingStatus>

/** Off the list and off the calendar: read to the end, or given up. */
export const FINISHED_READING_STATUSES = [
  'done',
  'dropped',
] as const satisfies readonly ReadingStatus[]

/** Whether the item is off the list. */
export const readingIsFinished = (status: ReadingStatus): boolean =>
  (FINISHED_READING_STATUSES as readonly ReadingStatus[]).includes(status)

const readingTitle = titleText
// http(s) only: the list renders the url as a link someone will click.
const readingUrl = z
  .url()
  .max(2000)
  .refine((u) => /^https?:\/\//i.test(u), { message: 'expected an http(s) url' })
const author = nameText

/** What capture has: a pasted url, or a typed title. The rest is edited afterwards. */
export const createReadingItemBody = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('link'), url: readingUrl }).strict(),
  z.object({ kind: z.literal('book'), title: readingTitle }).strict(),
])
export type CreateReadingItemBody = z.infer<typeof createReadingItemBody>

/** `kind` cannot change: a link does not become a book. */
export const updateReadingItemBody = z
  .object({
    title: readingTitle.nullable().optional(),
    url: readingUrl.optional(),
    author: author.nullable().optional(),
    status: readingStatus.optional(),
    projectId: z.uuid().nullable().optional(),
    planOn: calendarDate.nullable().optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: 'expected at least one field' })
export type UpdateReadingItemBody = z.infer<typeof updateReadingItemBody>

export const readingItemResponse = z
  .object({
    id: z.uuid(),
    kind: z.enum(READING_KINDS),
    title: z.string().nullable(),
    url: z.string().nullable(),
    author: z.string().nullable(),
    status: readingStatus,
    /** The day you mean to finish it by: a plan, not a deadline. */
    planOn: calendarDate.nullable(),
    projectId: z.uuid().nullable(),
    projectName: z.string().nullable(),
    /** What the page itself says, kept apart from `title`; a title someone typed wins. */
    fetchedTitle: z.string().nullable(),
    fetchedSummary: z.string().nullable(),
    createdAt: instant,
    updatedAt: instant,
  })
  .strict()
export type ReadingItemResponse = z.infer<typeof readingItemResponse>

export const readingItemsResponse = z.object({ items: z.array(readingItemResponse) }).strict()

export const readingListQuery = z
  .object({
    /** Only the items on no project. */
    unfiled: z.enum(['true', 'false']).optional(),
  })
  .strict()
