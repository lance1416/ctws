import type { TaskId } from '@ctws/contracts'
import { byRank } from '@ctws/core/rank'

/**
 * Turns the flat task array into the ordered, indented rows the tree renders. On a flat row list a
 * drop is just "between which two rows, how far indented", which `drop.ts` works out.
 */
export type TaskNode<Id extends string = TaskId> = {
  id: Id
  parentId: Id | null
  rank: string
}

export type FlatRow<Id extends string = TaskId> = {
  id: Id
  parentId: Id | null
  /** A root task is depth 1, matching the API's depth accounting. */
  depth: number
  /** A leaf is 1. Counts the whole subtree, including descendants hidden by a collapse. */
  subtreeHeight: number
  hasChildren: boolean
  collapsed: boolean
}

/** How many rows the row at `index` and its visible subtree take. */
export function blockLength(rows: readonly FlatRow<string>[], index: number): number {
  let end = index + 1
  while (end < rows.length && rows[end]!.depth > rows[index]!.depth) end++
  return end - index
}

export function flatten<Id extends string>(
  nodes: readonly TaskNode<Id>[],
  collapsed: ReadonlySet<Id>,
): FlatRow<Id>[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  // A node whose parent is absent from this list becomes a root: the parent may have been
  // soft-deleted between fetches, and losing the child silently would be worse.
  const parentOf = (n: TaskNode<Id>) =>
    n.parentId !== null && byId.has(n.parentId) ? n.parentId : null

  const children = new Map<Id | null, TaskNode<Id>[]>()
  for (const n of nodes) {
    const key = parentOf(n)
    const list = children.get(key)
    if (list) list.push(n)
    else children.set(key, [n])
  }

  // (rank, id): ranks are not unique, and the id breaks ties, as the server orders them.
  for (const list of children.values()) {
    list.sort(byRank)
  }

  const heights = new Map<Id, number>()
  const heightOf = (id: Id, seen: Set<Id>): number => {
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

  const rows: FlatRow<Id>[] = []
  const visited = new Set<Id>()

  const markVisited = (id: Id) => {
    if (visited.has(id)) return
    visited.add(id)
    for (const k of children.get(id) ?? []) markVisited(k.id)
  }

  const pushRow = (n: TaskNode<Id>, depth: number, parentId: Id | null) => {
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
    visited.add(n.id)
  }

  const visit = (parent: Id | null, depth: number, onPath: Set<Id>) => {
    for (const n of children.get(parent) ?? []) {
      // Unreachable while a cycle has no entry from the roots; it keeps a walk into one from
      // hanging the page.
      if (onPath.has(n.id)) continue
      pushRow(n, depth, parentOf(n))
      if (!collapsed.has(n.id)) {
        onPath.add(n.id)
        visit(n.id, depth + 1, onPath)
        onPath.delete(n.id)
      } else {
        // Hidden, not unreachable: without this the leftover pass below would emit them as roots.
        for (const k of children.get(n.id) ?? []) markVisited(k.id)
      }
    }
  }

  visit(null, 1, new Set())

  // What the walk never reached sits on a parent cycle. Each is emitted flat, as a root with no
  // descent, so corrupt data shows as an odd flat list; `drop.ts` relies on them being roots.
  for (const n of [...nodes].sort(byRank)) {
    if (visited.has(n.id)) continue
    pushRow(n, 1, null)
  }

  return rows
}
