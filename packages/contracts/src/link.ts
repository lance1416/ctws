import { z } from 'zod'

/**
 * A link is `from --kind--> to` between any two things. One row says both who is at a meeting and
 * which meetings a person has been at.
 */

/** Every kind of thing that can be at either end of a link. */
export const OBJECT_TYPES = ['task', 'reading', 'person', 'meeting', 'project'] as const
const objectType = z.enum(OBJECT_TYPES)
export type ObjectType = z.infer<typeof objectType>

/** The kinds of edge and what may be at each end; `null` means any type. */
export const LINK_KINDS = [
  // No label: the group it lands in is already called Projects.
  { kind: 'belongs', from: null, to: 'project', label: '', inverse: '' },
  { kind: 'attends', from: 'meeting', to: 'person', label: 'attendee', inverse: 'attended' },
  {
    kind: 'recommends',
    from: 'person',
    to: 'reading',
    label: 'recommended',
    inverse: 'recommended by',
  },
  { kind: 'about', from: null, to: null, label: 'about', inverse: 'about' },
] as const satisfies readonly {
  kind: string
  from: ObjectType | null
  to: ObjectType | null
  /** Read along the edge: "this meeting -- attendee -- Ying". Empty when the group says it. */
  label: string
  /** Read against it, on the other object's page: "Ying -- attended -- this meeting". */
  inverse: string
}[]

export type LinkKind = (typeof LINK_KINDS)[number]['kind']
const linkKind = z.enum(LINK_KINDS.map((l) => l.kind) as [LinkKind, ...LinkKind[]])

/** Whether the model allows this edge. */
export function linkIsAllowed(kind: string, from: string, to: string): boolean {
  const rule = LINK_KINDS.find((l) => l.kind === kind)
  if (!rule) return false
  if (rule.from !== null && rule.from !== from) return false
  if (rule.to !== null && rule.to !== to) return false
  return !(from === to && rule.from === rule.to && rule.from !== null)
}

const endpoint = z.object({ type: objectType, id: z.uuid() }).strict()

export const createLinkBody = z
  .object({ from: endpoint, to: endpoint, kind: linkKind })
  .strict()
  .refine((l) => linkIsAllowed(l.kind, l.from.type, l.to.type), {
    message: 'that is not a kind of link between those two things',
    path: ['kind'],
  })
  .refine((l) => !(l.from.type === l.to.type && l.from.id === l.to.id), {
    message: 'a thing cannot be linked to itself',
    path: ['to'],
  })
export type CreateLinkBody = z.infer<typeof createLinkBody>

/** The thing at the other end of an edge, with enough to draw a row and go there. */
const linkedObject = z
  .object({
    type: objectType,
    id: z.uuid(),
    title: z.string(),
    /** The second line: what that kind of thing says about itself. */
    detail: z.string().nullable(),
    /** The link, as read from the object whose page this is. */
    kind: linkKind,
    label: z.string(),
    /** Which way the edge runs, so removing it knows which end is which. */
    outgoing: z.boolean(),
    /** False for an edge a module stores itself, such as a task's project. */
    removable: z.boolean(),
  })
  .strict()
export type LinkedObject = z.infer<typeof linkedObject>

/** Something that could go at the other end, while its name is being typed. */
const linkCandidate = z
  .object({ type: objectType, id: z.uuid(), title: z.string(), detail: z.string().nullable() })
  .strict()
export type LinkCandidate = z.infer<typeof linkCandidate>

export const candidatesQuery = z
  .object({
    /** Empty means the most likely few. */
    q: z.string().trim().max(200).optional(),
    /** The thing being linked from: the answer leaves out itself and what it cannot join. */
    type: objectType,
    id: z.uuid(),
  })
  .strict()

export const candidatesResponse = z.object({ candidates: z.array(linkCandidate) }).strict()
export type CandidatesResponse = z.infer<typeof candidatesResponse>

/** The kinds of edge allowed between two types, `about` last as the fallback. */
export function kindsBetween(from: ObjectType, to: ObjectType): typeof LINK_KINDS {
  return LINK_KINDS.filter((l) => linkIsAllowed(l.kind, from, to)) as unknown as typeof LINK_KINDS
}

/** Everything linked to one object, grouped the way its page shows it. */
export const linksResponse = z
  .object({
    groups: z.array(
      z.object({ label: z.string(), type: objectType, items: z.array(linkedObject) }).strict(),
    ),
  })
  .strict()
export type LinksResponse = z.infer<typeof linksResponse>

export const linkParams = z.object({ type: objectType, id: z.uuid() }).strict()

/** Names one edge to remove: both ends and the kind are its identity. */
export const linkQuery = z
  .object({
    fromType: objectType,
    fromId: z.uuid(),
    toType: objectType,
    toId: z.uuid(),
    kind: linkKind,
  })
  .strict()

export const createLinkResponse = z.object({ created: z.boolean() }).strict()
