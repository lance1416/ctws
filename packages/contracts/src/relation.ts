import { z } from 'zod'
import { instant } from './common'
import { objectId, relationId } from './id'
import { thingWith } from './link'
import { objectType } from './object'

/**
 * A relation joins any two things without saying how (FR-042): relations with a fixed meaning
 * (a meeting's people, a reading's recommender, what belongs to a project) are fields of the
 * things themselves. A relation is made by hand, with an optional line of why, or by mentioning
 * one thing in another's text, which carries the sentence it was mentioned in.
 */
export const RELATION_ORIGINS = ['manual', 'mention'] as const
export type RelationOrigin = (typeof RELATION_ORIGINS)[number]

const endpoint = z.object({ type: objectType, id: objectId }).strict()

/** The one line of why, when there is one. */
const relationNote = z.string().trim().min(1).max(200)

export const createRelationBody = z
  .object({ from: endpoint, to: endpoint, note: relationNote.nullish() })
  .strict()
  // Both ids are already in lower case, so an upper-case copy of one cannot slip past.
  .refine((r) => !(r.from.type === r.to.type && r.from.id === r.to.id), {
    message: 'a thing cannot be related to itself',
    path: ['to'],
  })

export const updateRelationBody = z.object({ note: relationNote.nullable() }).strict()

export const relationParams = z.object({ id: relationId }).strict()

/** One relation, as stored. */
export const relationResponse = z.object({
  id: relationId,
  from: endpoint,
  to: endpoint,
  origin: z.enum(RELATION_ORIGINS),
  note: z.string().nullable(),
  /** The sentence that mentioned the far end, for a relation a mention made. */
  excerpt: z.string().nullable(),
  createdAt: instant,
})
export type RelationResponse = z.infer<typeof relationResponse>

/** The thing at the other end of a relation, named by its kind, with the relation itself. */
const relatedObject = thingWith({
  relationId,
  origin: z.enum(RELATION_ORIGINS),
  note: z.string().nullable(),
  excerpt: z.string().nullable(),
  /** Whether the page's thing is the one that made the relation (or whose text mentions). */
  outgoing: z.boolean(),
  createdAt: instant,
})
export type RelatedObject = z.infer<typeof relatedObject>

/** Kinds of thing as one query parameter, comma separated: `task,person`. */
const objectTypeList = z
  .string()
  .transform((list) => list.split(','))
  .pipe(z.array(objectType).min(1))

/** The thing whose relations are asked for, and the kinds at the far end to list. */
export const relationsQuery = z
  .object({ type: objectType, id: objectId, types: objectTypeList.optional() })
  .strict()

/** Everything related to one thing, grouped by kind the way its page shows it. */
export const relationsResponse = z.object({
  groups: z.array(z.object({ type: objectType, items: z.array(relatedObject) })),
})
export type RelationsResponse = z.infer<typeof relationsResponse>
