/**
 * How far along a task tree is: a pure fold over the flat task list. The two time-dependent flags
 * arrive already decided in the account's zone.
 */

export type RollupStatus = 'backlog' | 'todo' | 'in_progress' | 'done' | 'cancelled'

/** One live task, flat. Deleted rows are filtered out before this. */
export type RollupNode = {
  id: string
  parentId: string | null
  status: RollupStatus
  /** Set by hand, 0..1; only read on a leaf. */
  manualProgress: number | null
  /** Past its deadline and not finished. */
  overdue: boolean
  /** Due before the end of tomorrow. */
  dueSoon: boolean
  /**
   * The task's last logged change as a fixed-width UTC ISO string, or null. The fold takes the
   * string maximum, which is the latest instant only in that format.
   */
  lastActivityAt: string | null
}

export type RollupCounts = Record<RollupStatus, number>

export type Rollup = {
  /** 0..1, or null for a node left out (backlog, cancelled): not counted is not zero. */
  progress: number | null
  /** Statuses across the subtree, this node included. */
  counts: RollupCounts
  /** Across the subtree. */
  overdue: number
  dueSoon: number
  /** The latest change anywhere in the subtree: a stalled 60% reads differently from a live one. */
  lastActivityAt: string | null
}

const ZERO: RollupCounts = { backlog: 0, todo: 0, in_progress: 0, done: 0, cancelled: 0 }

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
    const counts: RollupCounts = { ...ZERO }
    counts[node.status] = 1
    let overdue = node.overdue ? 1 : 0
    let dueSoon = node.dueSoon ? 1 : 0
    let lastActivityAt = node.lastActivityAt
    for (const k of kids) {
      for (const s of Object.keys(ZERO) as RollupStatus[]) counts[s] += k.counts[s]
      overdue += k.overdue
      dueSoon += k.dueSoon
      if (
        k.lastActivityAt !== null &&
        (lastActivityAt === null || k.lastActivityAt > lastActivityAt)
      )
        lastActivityAt = k.lastActivityAt
    }

    out.set(node.id, {
      progress: progressOf(node, kids),
      counts,
      overdue,
      dueSoon,
      lastActivityAt,
    })
  }

  // Unreached because of a cycle: fold as a leaf.
  for (const node of nodes) {
    if (!out.has(node.id)) {
      const counts: RollupCounts = { ...ZERO }
      counts[node.status] = 1
      out.set(node.id, {
        progress: progressOf(node, []),
        counts,
        overdue: node.overdue ? 1 : 0,
        dueSoon: node.dueSoon ? 1 : 0,
        lastActivityAt: node.lastActivityAt,
      })
    }
  }
  return out
}

/**
 * - `backlog` and `cancelled` are left out, whatever is under them.
 * - A parent is the mean of its direct children, not of the subtree's leaves, so breaking a task
 *   down does not lower its number, and the number is the average of what is shown under it.
 * - A parent whose children are all left out falls back to its own status, like a leaf.
 * - A leaf scores 1 when done, else its manual progress, else 0 (`in_progress` is not 0.5).
 */
function progressOf(node: RollupNode, children: readonly Rollup[]): number | null {
  if (node.status === 'backlog' || node.status === 'cancelled') return null
  const live = children.map((c) => c.progress).filter((p): p is number => p !== null)
  if (live.length === 0) {
    if (node.status === 'done') return 1
    return node.manualProgress ?? 0
  }
  return live.reduce((a, b) => a + b, 0) / live.length
}
