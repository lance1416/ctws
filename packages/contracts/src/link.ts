import { z } from 'zod'
import { instant } from './common'
import { linkId, objectId } from './id'
import { objectType, type ObjectType } from './object'
import { TASK_STATUSES } from './task'

/**
 * A link is `from --kind--> to` between any two things. One row says both who is at a meeting and
 * which meetings a person has been at.
 */

/** The kinds of edge and what may be at each end; `null` means any type. */
export const LINK_KINDS = [
  // What is filed under projects by link. A task's project is its own column, and projects do
  // not nest. No label: the group it lands in is already called Projects.
  {
    kind: 'belongs',
    from: ['reading', 'meeting', 'person'],
    to: ['project'],
    label: '',
    inverse: '',
  },
  { kind: 'attends', from: ['meeting'], to: ['person'], label: 'attendee', inverse: 'attended' },
  {
    kind: 'recommends',
    from: ['person'],
    to: ['reading'],
    label: 'recommended',
    inverse: 'recommended by',
  },
  { kind: 'about', from: null, to: null, label: 'about', inverse: 'about' },
] as const satisfies readonly {
  kind: string
  from: readonly ObjectType[] | null
  to: readonly ObjectType[] | null
  /** Read along the edge: "this meeting -- attendee -- Ying". Empty when the group says it. */
  label: string
  /** Read against it, on the other object's page: "Ying -- attended -- this meeting". */
  inverse: string
}[]

type LinkRule = (typeof LINK_KINDS)[number]
export type LinkKind = LinkRule['kind']

/** The types a rule allows at one end; `null` is any. */
type EndOf<Types> = Types extends readonly ObjectType[] ? Types[number] : ObjectType
type EdgeOf<Rule> = Rule extends LinkRule
  ? {
      kind: Rule['kind']
      from: { type: EndOf<Rule['from']>; id: string }
      to: { type: EndOf<Rule['to']>; id: string }
    }
  : never

/**
 * An edge the model allows, by kind. A `belongs` edge from a task or a project is not one, so no
 * code can write it down: a task's project is its own column, and projects do not nest.
 */
export type LinkEdge = EdgeOf<LinkRule>
const linkKind = z.enum(LINK_KINDS.map((l) => l.kind) as [LinkKind, ...LinkKind[]])

/** The words for an edge, read from one end: along it ("attendee") or against it ("attended"). */
export function edgeLabel(kind: LinkKind, outgoing: boolean): string {
  const rule = LINK_KINDS.find((l) => l.kind === kind)!
  return outgoing ? rule.label : rule.inverse
}

/** Whether the model allows this edge. */
export function linkIsAllowed(kind: string, from: string, to: string): boolean {
  const rule = LINK_KINDS.find((l) => l.kind === kind)
  if (!rule) return false
  const allows = (types: readonly string[] | null, type: string) => !types || types.includes(type)
  return allows(rule.from, from) && allows(rule.to, to)
}

/** Whether the model allows this edge; one it allows is a `LinkEdge`. */
export function isLinkEdge(edge: {
  kind: LinkKind
  from: { type: ObjectType; id: string }
  to: { type: ObjectType; id: string }
}): edge is LinkEdge {
  return linkIsAllowed(edge.kind, edge.from.type, edge.to.type)
}

const endpoint = z.object({ type: objectType, id: objectId }).strict()

export const createLinkBody = z
  .object({ from: endpoint, to: endpoint, kind: linkKind })
  .strict()
  .transform((l, ctx) => {
    if (isLinkEdge(l)) return l
    ctx.addIssue({
      code: 'custom',
      message: 'that is not a kind of link between those two things',
      path: ['kind'],
    })
    return z.NEVER
  })
  // Both ids are already in lower case, so an upper-case copy of one cannot slip past.
  .refine((l) => !(l.from.type === l.to.type && l.from.id === l.to.id), {
    message: 'a thing cannot be linked to itself',
    path: ['to'],
  })
export type CreateLinkBody = z.output<typeof createLinkBody>

/**
 * A thing as a list of things names it: its title, and the facts its kind shows on the second
 * line, which the web puts into words. `shape` is what every kind has besides.
 */
export const thingWith = <S extends z.ZodRawShape>(shape: S) =>
  z.discriminatedUnion('type', [
    z.object({
      ...shape,
      type: z.literal('task'),
      id: objectId,
      title: z.string(),
      status: z.enum(TASK_STATUSES),
      projectName: z.string(),
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
      org: z.string().nullable(),
    }),
    // The series' own start, in its own zone: an edge is to the series, not to one occurrence.
    z.object({
      ...shape,
      type: z.literal('meeting'),
      id: objectId,
      title: z.string(),
      startsAt: instant,
      timeZone: z.string(),
    }),
    z.object({ ...shape, type: z.literal('project'), id: objectId, title: z.string() }),
  ])

/** Something that could go at the other end, while its name is being typed. */
const linkCandidate = thingWith({})
export type LinkCandidate = z.infer<typeof linkCandidate>

/** The thing at the other end of an edge, with enough to draw a row and go there. */
const linkedObject = thingWith({
  /** The link, as read from the object whose page this is. */
  kind: linkKind,
  /** Which way the edge runs: whether it is read along the edge or against it. */
  outgoing: z.boolean(),
  /** The link to remove, or null for an edge a module stores itself, such as a task's project. */
  linkId: linkId.nullable(),
})
export type LinkedObject = z.infer<typeof linkedObject>

export const candidatesQuery = z
  .object({
    view: z.literal('candidates'),
    /** Empty means the most likely few. */
    q: z.string().trim().max(200).optional(),
    /** The thing being linked from: the answer leaves out itself and what it cannot join. */
    type: objectType,
    id: objectId,
  })
  .strict()

export const candidatesResponse = z.object({ candidates: z.array(linkCandidate) })
export type CandidatesResponse = z.infer<typeof candidatesResponse>

/** The kinds of edge allowed between two types, `about` last as the fallback. */
export function kindsBetween(from: ObjectType, to: ObjectType): typeof LINK_KINDS {
  return LINK_KINDS.filter((l) => linkIsAllowed(l.kind, from, to)) as unknown as typeof LINK_KINDS
}

/** Everything linked to one object, grouped by kind the way its page shows it. */
export const linksResponse = z.object({
  groups: z.array(z.object({ type: objectType, items: z.array(linkedObject) })),
})
export type LinksResponse = z.infer<typeof linksResponse>

/** Kinds of thing as one query parameter, comma separated: `task,person`. */
const objectTypeList = z
  .string()
  .transform((list) => list.split(','))
  .pipe(z.array(objectType).min(1))

/** The thing whose links are asked for, and the kinds at the far end to list. */
export const linksQuery = z
  .object({
    type: objectType,
    id: objectId,
    /** Every kind when left out. */
    types: objectTypeList.optional(),
  })
  .strict()

export const linkParams = z.object({ id: linkId }).strict()

/** One edge, as stored: its id, both ends and its kind. */
export const linkResponse = z.object({
  id: linkId,
  from: z.object(endpoint.shape),
  to: z.object(endpoint.shape),
  kind: linkKind,
})
