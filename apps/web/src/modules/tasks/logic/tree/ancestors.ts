/**
 * The parents above `id`, nearest first. Stops on a cycle, and at a parent missing from `nodes`,
 * which `flatten` renders as a root.
 */
export function ancestorsOf<Id extends string>(
  nodes: readonly { id: Id; parentId: Id | null }[],
  id: Id,
): Id[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const chain: Id[] = []
  const seen = new Set<Id>([id])
  let current = byId.get(id)?.parentId ?? null
  while (current !== null && byId.has(current) && !seen.has(current)) {
    chain.push(current)
    seen.add(current)
    current = byId.get(current)!.parentId
  }
  return chain
}
