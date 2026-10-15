/**
 * The parents above `id`, nearest first. Stops on a cycle, and at a parent missing from `nodes`,
 * which `flatten` renders as a root.
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
