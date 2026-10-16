/**
 * How far along a task tree is: a pure fold over the flat task list. `overdue` arrives already
 * decided in the account's zone.
 */

export type RollupStatus = 'backlog' | 'todo' | 'in_progress' | 'done' | 'cancelled'

/** One live task, flat. Deleted rows are filtered out before this. */
export type RollupNode = {
  id: string
  parentId: string | null
  status: RollupStatus
  /** Past its deadline and not finished. */
  overdue: boolean
}

export type Rollup = {
  /** 0..1, or null for a node left out (backlog, cancelled): not counted is not zero. */
  progress: number | null
  /** Tasks in progress across the subtree, this node included. */
  inProgress: number
  /** Across the subtree. */
  overdue: number
}

/**
 * Every node's rollup, keyed by id, in one iterative bottom-up pass. A node whose parent is not in
 * `nodes` counts as a root, and a node a cycle keeps the walk from reaching folds as a leaf, so
 * nothing is dropped.
 */
export function rollup(nodes: readonly RollupNode[]): Map<string, Rollup> {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const parentOf = (n: RollupNode) =>
    n.parentId !== null && byId.has(n.parentId) ? n.parentId : null

  const children = new Map<string | null, RollupNode[]>()
  for (const n of nodes) {
    const key = parentOf(n)
    const list = children.get(key)
    if (list) list.push(n)
    else children.set(key, [n])
  }

  // Post-order without recursion: push each node twice, and fold it the second time, by which
  // point every child already has its rollup.
  const out = new Map<string, Rollup>()
  const stack: { node: RollupNode; expanded: boolean }[] = (children.get(null) ?? [])
    .map((node) => ({ node, expanded: false }))
    .reverse()
  const seen = new Set<string>()

  while (stack.length > 0) {
    const frame = stack.pop()!
    const { node } = frame
    if (!frame.expanded) {
      if (seen.has(node.id)) continue
      seen.add(node.id)
      stack.push({ node, expanded: true })
      for (const child of (children.get(node.id) ?? []).slice().reverse()) {
        stack.push({ node: child, expanded: false })
      }
      continue
    }

    const kids = (children.get(node.id) ?? []).map((c) => out.get(c.id)!)
    const own = ownRollup(node, kids)
    for (const k of kids) {
      own.inProgress += k.inProgress
      own.overdue += k.overdue
    }
    out.set(node.id, own)
  }

  // Unreached because of a cycle: fold as a leaf.
  for (const node of nodes) {
    if (!out.has(node.id)) out.set(node.id, ownRollup(node, []))
  }
  return out
}

const ownRollup = (node: RollupNode, kids: readonly Rollup[]): Rollup => ({
  progress: progressOf(node, kids),
  inProgress: node.status === 'in_progress' ? 1 : 0,
  overdue: node.overdue ? 1 : 0,
})

/**
 * - `backlog` and `cancelled` are left out, whatever is under them.
 * - A parent is the mean of its direct children, not of the subtree's leaves, so breaking a task
 *   down does not lower its number, and the number is the average of what is shown under it.
 * - A parent whose children are all left out falls back to its own status, like a leaf.
 * - A leaf scores 1 when done, else 0 (`in_progress` is not 0.5).
 */
function progressOf(node: RollupNode, children: readonly Rollup[]): number | null {
  if (node.status === 'backlog' || node.status === 'cancelled') return null
  const live = children.map((c) => c.progress).filter((p): p is number => p !== null)
  if (live.length === 0) return node.status === 'done' ? 1 : 0
  return live.reduce((a, b) => a + b, 0) / live.length
}
