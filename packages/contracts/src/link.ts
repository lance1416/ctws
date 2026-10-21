import { z } from 'zod'
import { instant } from './common'
import { objectId } from './id'
import { objectType } from './object'
import { TASK_STATUSES } from './task'

/**
 * How a thing is named when listed among other things: its title, and the facts its kind shows
 * on the second line, which the web puts into words. `shape` is what every kind has besides.
 * Relations with a meaning are fields of the things themselves (FR-042); what joins any two is
 * in `relation.ts`.
 */
export const thingWith = <S extends z.ZodRawShape>(shape: S) =>
  z.discriminatedUnion('type', [
    z.object({
      ...shape,
      type: z.literal('task'),
      id: objectId,
      title: z.string(),
      status: z.enum(TASK_STATUSES),
      projectId: objectId,
      projectName: z.string(),
      /** The task it sits under, if any: with the project's square, where it is (artboard 9). */
      parentTitle: z.string().nullable(),
    }),
    z.object({
      ...shape,
      type: z.literal('reading'),
      id: objectId,
      title: z.string(),
      author: z.string().nullable(),
    }),
    z.object({
      ...shape,
      type: z.literal('person'),
      id: objectId,
      title: z.string(),
      /** The avatar's letters (FR-049). */
      initials: z.string(),
      /** Where they work now: the current role that began first; null with no current role. */
      org: z.string().nullable(),
    }),
    // The series' own start, in its own zone: a relation is to the series, not to one occurrence.
    z.object({
      ...shape,
      type: z.literal('meeting'),
      id: objectId,
      title: z.string(),
      startsAt: instant,
      timeZone: z.string(),
    }),
    z.object({ ...shape, type: z.literal('project'), id: objectId, title: z.string() }),
    z.object({
      ...shape,
      type: z.literal('organisation'),
      id: objectId,
      title: z.string(),
      organisationType: z.string().nullable(),
    }),
    z.object({
      ...shape,
      type: z.literal('communication'),
      id: objectId,
      title: z.string(),
      direction: z.enum(['sent', 'received']),
      occurredAt: instant,
    }),
    z.object({ ...shape, type: z.literal('note'), id: objectId, title: z.string() }),
  ])

/** Something that could go at the other end, while its name is being typed. */
const linkCandidate = thingWith({})
export type LinkCandidate = z.infer<typeof linkCandidate>

/** Kinds of thing as one query parameter, comma separated: `task,person`. */
const objectTypeList = z
  .string()
  .transform((list) => list.split(','))
  .pipe(z.array(objectType).min(1))

/**
 * Things of every kind by name, among which kinds (`/`, FR-024): the link picker's question, what
 * could this thing be related to, and search's for the kinds no module searches more closely.
 */
export const candidatesQuery = z
  .object({
    view: z.literal('candidates'),
    /** Empty means the most likely few. */
    q: z.string().trim().max(200).optional(),
    /** The thing being related from, which the answer leaves out; both or neither. */
    type: objectType.optional(),
    id: objectId.optional(),
    /** Only these kinds; every kind when left out. */
    kinds: objectTypeList.optional(),
  })
  .strict()
  .refine((q) => (q.type === undefined) === (q.id === undefined), {
    message: 'a thing is named by its type and id together',
    path: ['id'],
  })

export const candidatesResponse = z.object({ candidates: z.array(linkCandidate) })
export type CandidatesResponse = z.infer<typeof candidatesResponse>
