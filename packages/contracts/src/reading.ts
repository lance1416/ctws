import { z } from 'zod'
import { calendarDate } from './task'

/**
 * THE READING LIST -- THE SECOND MODULE.
 *
 * One entity, two kinds. A tweet is not modelled separately: it is a link whose host is x.com,
 * and three types for two behaviours is a type system built for a taxonomy nobody asked for.
 *
 * What a LINK has is a url; what a BOOK has is an author and no url. A link's title may be
 * absent, because capturing one is pasting a url and nothing else -- the list shows the host
 * until someone types a title. A book with no title is not a book, so there it is required.
 */

export const READING_KINDS = ['link', 'book'] as const
export const readingKind = z.enum(READING_KINDS)
export type ReadingKind = z.infer<typeof readingKind>

/** To read / reading / finished / dropped. No page numbers: nobody keeps them up to date. */
export const READING_STATUSES = ['todo', 'reading', 'done', 'dropped'] as const
export const readingStatus = z.enum(READING_STATUSES)
export type ReadingStatus = z.infer<typeof readingStatus>

const readingTitle = z.string().trim().min(1).max(500)
// http(s) only. A `javascript:` or `data:` url in an href is the whole reason this is not a bare
// string: the list renders it as a link someone will click.
const readingUrl = z
  .url()
  .max(2000)
  .refine((u) => /^https?:\/\//i.test(u), { message: 'expected an http(s) url' })
const author = z.string().trim().min(1).max(200)

/**
 * The two shapes, as a discriminated union rather than one object with four optional fields: a
 * book with a url and a link with an author are both nonsense, and a union says so at the edge
 * instead of leaving the database's CHECK constraint to be the only thing that knows.
 */
export const createReadingItemBody = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('link'),
      url: readingUrl,
      /** Absent when the line was just a pasted url; the list shows the host instead. */
      title: readingTitle.nullish(),
      projectId: z.uuid().nullish(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('book'),
      title: readingTitle,
      author: author.nullish(),
      projectId: z.uuid().nullish(),
    })
    .strict(),
])
export type CreateReadingItemBody = z.infer<typeof createReadingItemBody>

/**
 * Every field optional, and `kind` is NOT among them: a link does not become a book. Changing
 * what something is means making the other one.
 */
export const updateReadingItemBody = z
  .object({
    title: readingTitle.nullable().optional(),
    url: readingUrl.optional(),
    author: author.nullable().optional(),
    status: readingStatus.optional(),
    projectId: z.uuid().nullable().optional(),
    /** The day you mean to finish it by. A calendar day, like a task's plan -- never an instant. */
    planOn: calendarDate.nullable().optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: 'expected at least one field' })
export type UpdateReadingItemBody = z.infer<typeof updateReadingItemBody>

export const readingItemResponse = z
  .object({
    id: z.uuid(),
    kind: readingKind,
    title: z.string().nullable(),
    url: z.string().nullable(),
    author: z.string().nullable(),
    status: readingStatus,
    /**
     * The day you mean to finish it by, or null.
     *
     * A PLAN, not a deadline: nothing goes overdue here and nothing nags. It exists because a
     * reading list with no dates at all cannot say which book this week is for, and because the calendar
     * needs a second module's worth of dated things or its contribution point would be shaped
     * around the task module alone.
     */
    planOn: calendarDate.nullable(),
    projectId: z.uuid().nullable(),
    /** The project's name, so a cross-project list need not fetch them separately. */
    projectName: z.string().nullable(),
    /** What "added 17 days ago" is counted from. */
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict()
export type ReadingItemResponse = z.infer<typeof readingItemResponse>

export const readingListQuery = z
  .object({
    projectId: z.uuid().optional(),
    /**
     * Only the items that belong to NO project.
     *
     * A separate flag rather than `projectId=none`, because it is not a project id and typing one
     * where a uuid is expected is how a filter silently becomes no filter. It is also the
     * complement of `projectId`, so asking for both is a contradiction and is refused below.
     */
    unfiled: z.enum(['true', 'false']).optional(),
    /** Repeatable: `?status=todo&status=reading`. Absent means every status. */
    status: z.union([readingStatus, z.array(readingStatus)]).optional(),
  })
  .strict()
  .refine((q) => !(q.projectId && q.unfiled === 'true'), {
    message: 'unfiled and projectId cannot both be asked for',
  })
export type ReadingListQuery = z.infer<typeof readingListQuery>
