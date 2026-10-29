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
  // A linkable that names its rows by another's knowledge has them named on every way out, and
  // found by those names too.
  const named = (l: Linkable): Linkable => {
    const also = async (
      q: Parameters<Linkable['rows']>[0],
      workspaceId: Parameters<Linkable['rows']>[1],
      text: string,
    ) => (l.alsoFound && text !== '' ? l.alsoFound(q, workspaceId, text, registry) : [])
    const rows: Linkable['rows'] = async (q, workspaceId, want) => {
      const asked = 'text' in want ? { ...want, also: await also(q, workspaceId, want.text) } : want
      const found = await l.rows(q, workspaceId, asked)
      return l.retitle ? l.retitle(q, workspaceId, found, registry) : found
    }
    return l.retitle || l.alsoFound
      ? {
          ...l,
          rows,
          count: async (q, workspaceId, text) =>
            l.count(q, workspaceId, text, await also(q, workspaceId, text)),
        }
      : l
  }
  const wrapped = new Map([...byType].map(([t, l]) => [t, named(l)]))
  const registry: LinkRegistry = {
    all: linkables.map(named),
    order: linkables.map((l) => l.type),
    of: (type) => wrapped.get(type)!,
  }
  return registry
}
