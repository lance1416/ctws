import { z } from 'zod'

/**
 * EDGES BETWEEN THINGS -- the shell's own table, and the one way anything reaches anything else.
 *
 * A link is `from --kind--> to`, where both ends name an object by its type and id. One row says
 * who is at a meeting and which meetings a person has been at, so neither side has to be kept in
 * step with the other.
 */

/** Every kind of thing that can be at either end of a link. */
export const OBJECT_TYPES = ['task', 'reading', 'person', 'meeting', 'project'] as const
export const objectType = z.enum(OBJECT_TYPES)
export type ObjectType = z.infer<typeof objectType>

/**
 * THE KINDS OF EDGE, and what may be at each end.
 *
 * A small fixed set rather than free text: a link whose meaning is whatever somebody typed cannot
 * be read back by anything, and what an edge MEANS is the first thing a reader needs. New kinds
 * are cheap to add; a kind nobody can interpret is not.
 *
 * `null` for an end means any type.
 */
export const LINK_KINDS = [
  // `belongs` says nothing out loud: the group it lands in is already called Projects, and a
  // row reading "Projects / Job hunt / in" says the same thing twice.
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
export const linkKind = z.enum(LINK_KINDS.map((l) => l.kind) as [LinkKind, ...LinkKind[]])

/** Whether this edge is one the model allows, which is the only check there is on a link. */
export function linkIsAllowed(kind: string, from: string, to: string): boolean {
  const rule = LINK_KINDS.find((l) => l.kind === kind)
  if (!rule) return false
  if (rule.from !== null && rule.from !== from) return false
  if (rule.to !== null && rule.to !== to) return false
  // A thing is not related to itself, whatever the kind.
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

/**
 * ONE THING AT THE OTHER END OF AN EDGE, with enough to draw a row and go there.
 *
 * The shell fills this in: it is the shell that owns the edges, so it is the shell that has to be
 * able to name what is at the end of one without asking a module.
 */
export const linkedObject = z
  .object({
    type: objectType,
    id: z.uuid(),
    title: z.string(),
    /** The second line: whatever that kind of thing says about itself in one phrase. */
    detail: z.string().nullable(),
    /** The link itself, as read FROM the object whose page this is. */
    kind: linkKind,
    label: z.string(),
    /** Which way the edge runs, so removing it knows which end is which. */
    outgoing: z.boolean(),
    /**
     * Whether this edge can be taken off HERE.
     *
     * False for an edge a module stores itself -- a task's project is a NOT NULL column, and
     * "unlink" on it would mean a task belonging to nothing, which that module does not allow.
     * The row still shows; it just has no way to remove it, and a reader can see which edges are
     * theirs to change.
     */
    removable: z.boolean(),
  })
  .strict()
export type LinkedObject = z.infer<typeof linkedObject>

/**
 * SOMETHING YOU COULD LINK TO, while you are typing its name.
 *
 * Thinner than `linkedObject`: there is no edge yet, so there is no kind and no direction.
 */
export const linkCandidate = z
  .object({ type: objectType, id: z.uuid(), title: z.string(), detail: z.string().nullable() })
  .strict()
export type LinkCandidate = z.infer<typeof linkCandidate>

export const candidatesQuery = z
  .object({
    /** What the picker has typed. Empty means "the most likely few", not "everything". */
    q: z.string().trim().max(200).optional(),
    /**
     * The thing being linked FROM, so the answer leaves out the kinds it could not be joined to
     * and the object itself. Both halves of the pair decide which kinds are allowed.
     */
    type: objectType,
    id: z.uuid(),
  })
  .strict()

export const candidatesResponse = z.object({ candidates: z.array(linkCandidate) }).strict()
export type CandidatesResponse = z.infer<typeof candidatesResponse>

/**
 * The kinds of edge allowed between two types, in the order the contract declares them.
 *
 * `about` is last wherever it appears: it is the one meaning "related, but none of the above",
 * so it reads as the fallback it is.
 */
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

/**
 * NAMING ONE EDGE TO REMOVE IT. Both ends and the kind, because that tuple IS the edge's identity
 * -- there is no id to hand back, and inventing one would be a second way to say the same thing.
 */
export const linkQuery = z
  .object({
    fromType: objectType,
    fromId: z.uuid(),
    toType: objectType,
    toId: z.uuid(),
    kind: linkKind,
  })
  .strict()
export type LinkQuery = z.infer<typeof linkQuery>

/**
 * WHAT A MODULE IS ASKED WHEN SOMEBODY TYPES IN THE SEARCH BOX.
 *
 * One box feeds every module (the shell merges their answers), so the bound has to be the shell's:
 * a module that accepted 300 characters where another stopped at 200 would make the same keystroke
 * mean two things. Trimmed and non-empty, because a blank query matching every row in the
 * workspace is a full table scan dressed up as a result.
 */
export const searchQuery = z.object({ q: z.string().trim().min(1).max(200) }).strict()
export type SearchQuery = z.infer<typeof searchQuery>
