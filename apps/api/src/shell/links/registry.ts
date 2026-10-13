import { OBJECT_TYPES, type ObjectType } from '@ctws/contracts'
import { personLinkable } from '../../modules/people/linkable'
import { meetingLinkable } from '../../modules/meetings/linkable'
import { projectLinkable } from '../projects/linkable'
import { readingLinkable } from '../../modules/reading/linkable'
import { taskLinkable } from '../../modules/tasks/linkable'
import type { Linkable } from './linkable'

/**
 * EVERY KIND OF THING, and who answers for it.
 *
 * The one place that names all five, which is what a shell is for. Groups on an object page come
 * out in THIS order, the same on every page, rather than in whatever order the edges happened to
 * be stored.
 *
 * A type with no entry would make an object page silently drop a whole group, so
 * `links.test.ts` asserts the set is exactly `OBJECT_TYPES`.
 */
export const LINKABLES: readonly Linkable[] = Object.freeze([
  taskLinkable,
  meetingLinkable,
  personLinkable,
  readingLinkable,
  projectLinkable,
])

const byType = new Map(LINKABLES.map((l) => [l.type, l]))

export function linkableFor(type: ObjectType): Linkable {
  const found = byType.get(type)
  // Unreachable while the registry test holds; a throw rather than a silent empty group, because
  // the only way here is a type added to the contract and nowhere else.
  if (!found) throw new Error(`no module answers for ${type}`)
  return found
}

/** The types in registry order, for sorting groups. */
export const TYPE_ORDER: readonly ObjectType[] = Object.freeze(LINKABLES.map((l) => l.type))

export const EVERY_TYPE_ANSWERED =
  OBJECT_TYPES.every((t) => byType.has(t)) && byType.size === OBJECT_TYPES.length
