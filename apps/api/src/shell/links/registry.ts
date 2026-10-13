import { OBJECT_TYPES, type ObjectType } from '@ctws/contracts'
import type { Linkable } from './linkable'

export type LinkRegistry = {
  /** In page order: an object page lists its groups in this order. */
  all: readonly Linkable[]
  order: readonly ObjectType[]
  of(type: ObjectType): Linkable
}

export function linkRegistry(linkables: readonly Linkable[]): LinkRegistry {
  const byType = new Map(linkables.map((l) => [l.type, l]))
  const missing = OBJECT_TYPES.filter((t) => !byType.has(t))
  if (missing.length > 0 || byType.size !== linkables.length) {
    throw new Error(`every object type needs exactly one linkable; missing: ${missing.join(', ')}`)
  }
  return {
    all: linkables,
    order: linkables.map((l) => l.type),
    of: (type) => byType.get(type)!,
  }
}
