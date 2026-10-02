/**
 * Turns the API's flat task array into the ordered, indented rows the tree renders -- the
 * Workflowy/Notion shape. Deliberately NOT a recursive component tree: in recursive components
 * every node is a drag source and three separate drop targets at once, whereas on a
 * one-dimensional row list a drop is just "between which two rows, and how far indented". Task 6
 * (`drop.ts`) consumes these rows.
 *
 * Pure, and imports no React, so the ordering and height arithmetic are tested densely without
 * rendering anything.
 */
export type TaskNode = {
  id: string
  parentId: string | null
  rank: string
  title: string
  status: string
}

export type FlatRow = {
  id: string
  parentId: string | null
  /** A root task is depth 1, matching the API's depth accounting. */
  depth: number
  /** A leaf is 1. Counts the REAL subtree, including descendants hidden by a collapse. */
  subtreeHeight: number
  hasChildren: boolean
  collapsed: boolean
}

export function flatten(nodes: TaskNode[], collapsed: ReadonlySet<string>): FlatRow[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  // A node whose parent is absent from this list becomes a root: the parent may have been
  // soft-deleted between fetches, and losing the child silently would be worse.
  const parentOf = (n: TaskNode) =>
    n.parentId !== null && byId.has(n.parentId) ? n.parentId : null

  const children = new Map<string | null, TaskNode[]>()
  for (const n of nodes) {
    const key = parentOf(n)
    const list = children.get(key)
    if (list) list.push(n)
    else children.set(key, [n])
  }

  const byRankThenId = (a: TaskNode, b: TaskNode) =>
    a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : a.id < b.id ? -1 : 1

  // (rank, id): ranks are not unique, and id is the documented tiebreak (spec 5.3).
  for (const list of children.values()) {
    list.sort(byRankThenId)
  }

  const heights = new Map<string, number>()
  const heightOf = (id: string, seen: Set<string>): number => {
    const cached = heights.get(id)
    if (cached !== undefined) return cached
    if (seen.has(id)) return 1
    seen.add(id)
    const kids = children.get(id) ?? []
    const h = kids.length === 0 ? 1 : 1 + Math.max(...kids.map((k) => heightOf(k.id, seen)))
    seen.delete(id)
    heights.set(id, h)
    return h
  }

  const rows: FlatRow[] = []
  const emitted = new Set<string>()

  const pushRow = (n: TaskNode, depth: number, parentId: string | null) => {
    const kids = children.get(n.id) ?? []
    const isCollapsed = collapsed.has(n.id)
    rows.push({
      id: n.id,
      parentId,
      depth,
      subtreeHeight: heightOf(n.id, new Set()),
      hasChildren: kids.length > 0,
      collapsed: isCollapsed,
    })
    emitted.add(n.id)
  }

  const visit = (parent: string | null, depth: number, onPath: Set<string>) => {
    for (const n of children.get(parent) ?? []) {
      // onPath guards against cycles, but is currently unreachable: a cycle has no entry from the
      // root list, so visit is never called on a cycle node. It stays as insurance against a future
      // change that descends from unreachable nodes (which would hang the page without this guard).
      if (onPath.has(n.id)) continue
      pushRow(n, depth, parentOf(n))
      if (!collapsed.has(n.id)) {
        onPath.add(n.id)
        visit(n.id, depth + 1, onPath)
        onPath.delete(n.id)
      }
    }
  }

  visit(null, 1, new Set())

  // Anything the walk above never reached is on a parent cycle (a cycle has no entry from the
  // root list). The API's guards make that unreachable, but silently dropping tasks is the one
  // outcome this file exists to prevent -- a task missing from the tree reads as lost work.
  //
  // These rows are emitted FLAT, each at depth 1, with no descent. That is deliberate: descending
  // from them gave a second emission path with its own rules, which produced duplicate rows and
  // ignored the collapse state. Corrupt data therefore renders as an obviously odd flat list,
  // which is visible and fixable -- the same trade the orphan case above makes.
  // Flat-emitted rows are rendered as roots (parentId: null, depth: 1); drop.ts relies on this
  // invariant to find siblings at the root level.
  for (const n of [...nodes].sort(byRankThenId)) {
    if (emitted.has(n.id)) continue
    pushRow(n, 1, null)
  }

  return rows
}
