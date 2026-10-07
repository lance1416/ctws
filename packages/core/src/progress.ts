/**
 * PROGRESS ROLLUP (design spec §7). The one place that answers 「做到哪儿了」.
 *
 * It lives here, as a pure fold over a flat list, for the reason §7.5 gives: the recursive mean is
 * awkward in SQL and a dozen lines in TypeScript, and in TypeScript it can be covered case by case
 * against §7.2's edge list. Nothing in this file touches a clock, a timezone or a database -- the
 * two time-dependent counts arrive as booleans already decided in the account's zone, where the
 * rest of this app's day arithmetic lives.
 */

export type RollupStatus = 'backlog' | 'todo' | 'in_progress' | 'done' | 'cancelled'

/** One live task, flat. Deleted rows are filtered out before this (§7.2's first `filter`). */
export type RollupNode = {
  id: string
  parentId: string | null
  status: RollupStatus
  /** The manual escape hatch, 0..1, or null. Only ever consulted on a leaf. */
  manualProgress: number | null
  /** Its deadline has passed and it is not finished. Decided in the account's zone. */
  overdue: boolean
  /** Its deadline falls inside the near window. Decided in the account's zone. */
  dueSoon: boolean
  /**
   * When this task itself last changed, from the event log, as a UTC ISO instant -- or null if
   * nothing has ever been logged against it.
   *
   * UTC ISO AND NOTHING ELSE, because the fold takes the plain string MAXIMUM up the tree, and
   * that equals the chronological maximum only for a fixed-width, fixed-offset format. A local
   * time, or an offset other than `Z`, would sort wrong. The API formats it; the test below
   * pins it.
   */
  lastActivityAt: string | null
}

export type RollupCounts = Record<RollupStatus, number>

export type Rollup = {
  /**
   * 0..1, or null for a node §7.2 EXCLUDES (`backlog` and `cancelled`): those are not work in
   * flight, and averaging them in would drag every parent's number toward zero for things nobody
   * has started or has abandoned. Null is the sentinel rather than 0 because the difference
   * between "no progress" and "not counted" is the whole point of the rule.
   */
  progress: number | null
  /** The SUBTREE's statuses, this node included. */
  counts: RollupCounts
  /** How many in the subtree are past their deadline, and how many are about to be. */
  overdue: number
  dueSoon: number
  /**
   * The most recent change ANYWHERE in the subtree (§7.4). The point of it is not progress: a
   * line at 60% and a line at 60% that nobody has touched for three weeks are the same number
   * and completely different situations, and the second one is what actually goes wrong when
   * several lines of work run at once.
   */
  lastActivityAt: string | null
}

const ZERO: RollupCounts = { backlog: 0, todo: 0, in_progress: 0, done: 0, cancelled: 0 }

/**
 * Every node's rollup, keyed by id.
 *
 * ONE PASS, BOTTOM-UP, ITERATIVE. A node whose `parentId` names a row that is not in `nodes` is
 * treated as a root -- the same rule the web tree's `flatten` uses, and for the same reason: the
 * parent may have been soft-deleted between fetches, and silently dropping the child would make
 * the numbers quietly wrong rather than loudly wrong.
 *
 * A parent cycle cannot be produced by the API (`move` refuses one), but a cycle here would hang
 * the fold, so the ordering pass counts what it visits and anything it could not reach is folded
 * as a root. That is a defensive leaf, not a silent drop.
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

  // Anything a cycle kept the walk from reaching. It has no reachable children here, so it folds
  // as a leaf rather than vanishing from the result.
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
 * §7.2, exactly:
 *
 * - `backlog` and `cancelled` are EXCLUDED, whatever is under them.
 * - The mean is over DIRECT children, not over subtree leaves. Leaf counting would punish
 *   breaking work down -- a leaf worth 1/n becomes 4/(n+3) the moment someone writes out what it
 *   contains -- and breaking work down is the one habit this tool exists to encourage. The direct
 *   mean's failure mode is a static weighting error instead, which does not move with behaviour.
 *   It is also the only version a person can predict from what is on screen: a parent's number is
 *   the average of the numbers under it, and a number nobody can predict stops being believed.
 * - A node with children takes the derived value over its own status (§6.4).
 * - When every child is excluded it degrades to a leaf and falls back to its own status.
 * - A leaf that is `in_progress` scores 0, not 0.5. 0.5 is a number nobody entered.
 *   `manualProgress` is the only way to say "half done", and it is not cross-checked against the
 *   status: an explicit value the person set is not the system's to overrule.
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
