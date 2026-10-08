import { z } from 'zod'

/**
 * 东西之间的边 -- the shell's own, and the thing that replaces 「什么都挂到项目上」.
 *
 * Every module used to reach exactly one other thing: its project. Four tables, four columns, all
 * pointing at the same place, so none of these could be said at all:
 *
 *   这本书是陈颖推荐的 · 这个任务是那次二面之后产生的 · 这篇文章是为了下周那个会读的
 *
 * A link is `from --kind--> to`, where both ends name an object by its type and id. It is read in
 * BOTH directions, so writing 「这个会有谁参加」 is the same fact as 「我跟这个人开过哪些会」 and
 * neither side has to be kept in step with the other.
 */

/** Every kind of thing that can be at either end of a link. */
export const OBJECT_TYPES = ['task', 'reading', 'contact', 'meeting', 'project'] as const
export const objectType = z.enum(OBJECT_TYPES)
export type ObjectType = z.infer<typeof objectType>

/**
 * THE KINDS OF EDGE, and what may be at each end.
 *
 * A small fixed set rather than free text: a link whose meaning is whatever somebody typed cannot
 * be read back by anything, and the first thing a reader needs is 「这条边是什么意思」. New kinds
 * are cheap to add; a kind nobody can interpret is not.
 *
 * `null` for an end means any type.
 */
export const LINK_KINDS = [
  { kind: 'belongs', from: null, to: 'project', label: '属于', inverse: '相关' },
  { kind: 'attends', from: 'meeting', to: 'contact', label: '参与', inverse: '参加过' },
  { kind: 'recommends', from: 'contact', to: 'reading', label: '推荐', inverse: '推荐人' },
  { kind: 'about', from: null, to: null, label: '关于', inverse: '相关' },
] as const satisfies readonly {
  kind: string
  from: ObjectType | null
  to: ObjectType | null
  /** Read along the edge: 「这个会 参与 陈颖」. */
  label: string
  /** Read against it, on the other object's page: 「陈颖 参加过 这个会」. */
  inverse: string
}[]

export const linkKind = z.enum(LINK_KINDS.map((l) => l.kind) as [string, ...string[]])
export type LinkKind = (typeof LINK_KINDS)[number]['kind']

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
  })
  .strict()
export type LinkedObject = z.infer<typeof linkedObject>

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
