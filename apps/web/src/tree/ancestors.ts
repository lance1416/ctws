/**
 * The chain of parents above `id`, nearest first. Used to unfold the path to a task arrived at
 * from search: a result that routes to a collapsed subtree and leaves the person looking at a
 * parent has not found anything.
 *
 * Cycle-safe by construction (a corrupt parent chain would otherwise hang the page), and it stops
 * at a parent that is not in `nodes`, matching `flatten`'s rule that such a node renders as a root.
 */
export function ancestorsOf(
  nodes: readonly { id: string; parentId: string | null }[],
  id: string,
): string[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const chain: string[] = []
  const seen = new Set<string>([id])
  let current = byId.get(id)?.parentId ?? null
  while (current !== null && byId.has(current) && !seen.has(current)) {
    chain.push(current)
    seen.add(current)
    current = byId.get(current)!.parentId
  }
  return chain
}
