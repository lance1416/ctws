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
  const duplicated = [...byType.keys()].filter(
    (t) => linkables.filter((l) => l.type === t).length > 1,
  )
  if (missing.length > 0 || duplicated.length > 0) {
    const problems = [
      ...(missing.length > 0 ? [`missing: ${missing.join(', ')}`] : []),
      ...(duplicated.length > 0 ? [`duplicated: ${duplicated.join(', ')}`] : []),
    ]
    throw new Error(`every object type needs exactly one linkable; ${problems.join('; ')}`)
  }
  return {
    all: linkables,
    order: linkables.map((l) => l.type),
    of: (type) => byType.get(type)!,
  }
}
