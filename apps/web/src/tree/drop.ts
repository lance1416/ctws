import type { FlatRow } from './flatten'

/**
 * Must match `MAX_DEPTH` in apps/api/src/tasks/tasks.ts. Duplicated rather than fetched because
 * it is a product rule, not configuration -- but if the API's value ever changes, this one has
 * to change with it, and the clamp below is what would otherwise silently start handing the
 * server drops it rejects.
 */
export const MAX_DEPTH = 10

export type DropRequest = {
  /** The visible rows, in display order. */
  rows: FlatRow[]
  draggedId: string
  /** Insertion slot, 0..rows.length: the row lands between `rows[slot - 1]` and `rows[slot]`. */
  slot: number
  /** The depth the gesture is asking for, derived from the horizontal offset. */
  wantedDepth: number
}

export type DropPlan =
  | { ok: true; parentId: string | null; depth: number; beforeId?: string; afterId?: string }
  | { ok: false; reason: 'own-subtree' | 'too-deep' | 'unchanged' }

/**
 * Translates a gesture into the arguments of one `POST /tasks/:id/move` call.
 *
 * This is the whole reason the tree renders as flat rows: a drop becomes "between which two rows,
 * and how far indented", which is arithmetic that can be tested exhaustively without a browser.
 * The drag UI's only job is to produce `slot` and `wantedDepth`.
 *
 * **The guards here are about the experience, not about correctness.** The API enforces the
 * cycle, depth and project_id invariants and will answer 409; M2a's final review found a real
 * defect precisely because something assumed an upper layer had already checked. But a UI that
 * lets you make an illegal gesture and then snaps back is bad, so the illegal ones are refused
 * before they are attempted.
 */
export function planDrop(req: DropRequest): DropPlan {
  const { rows, draggedId, slot, wantedDepth } = req
  const index = rows.findIndex((r) => r.id === draggedId)
  if (index < 0) return { ok: false, reason: 'unchanged' }
  const dragged = rows[index]!

  // The dragged row's visible block: itself plus the contiguous rows deeper than it. Those
  // travel with it, so they are not candidate neighbours.
  let end = index + 1
  while (end < rows.length && rows[end]!.depth > dragged.depth) end++

  // A slot strictly inside the block is a drop into the row's own subtree.
  if (slot > index && slot < end) return { ok: false, reason: 'own-subtree' }

  const outside = (i: number) => i < index || i >= end
  let prev: FlatRow | null = null
  for (let i = slot - 1; i >= 0; i--) {
    if (outside(i)) {
      prev = rows[i]!
      break
    }
  }
  let next: FlatRow | null = null
  for (let i = slot; i < rows.length; i++) {
    if (outside(i)) {
      next = rows[i]!
      break
    }
  }

  // Upper bound from the row above: you may become its child, never deeper in one gesture.
  const maxByPrev = prev ? prev.depth + 1 : 1
  // Upper bound from the subtree's own height. Mirrors the API's rule
  // `parentDepth + liveHeight > MAX_DEPTH` -> rejected; the dragged row's new depth is
  // `parentDepth + 1`, hence `MAX_DEPTH - (height - 1)`. A leaf (height 1) may reach MAX_DEPTH;
  // a height-3 subtree may reach MAX_DEPTH - 2.
  const maxByHeight = MAX_DEPTH - (dragged.subtreeHeight - 1)
  // Lower bound from the row below: going shallower would silently re-parent that row.
  const minDepth = next ? next.depth : 1
  const maxDepth = Math.min(maxByPrev, maxByHeight)
  if (maxDepth < minDepth) return { ok: false, reason: 'too-deep' }

  const depth = Math.min(Math.max(wantedDepth, minDepth), maxDepth)

  // `depth > 1` implies `prev` exists: with no preceding row `maxByPrev` is 1, so the clamp
  // above would have produced 1.
  const parentId = depth === 1 ? null : ancestorAtDepth(rows, prev!, depth - 1)

  if (parentId === dragged.parentId && (slot === index || slot === end)) {
    return { ok: false, reason: 'unchanged' }
  }

  // Position among the new parent's children. Exactly one of beforeId/afterId, or neither: the
  // API rejects a body carrying both.
  if (prev && prev.depth >= depth) {
    // The row follows whichever of prev's ancestors-or-self sits at the new depth.
    const afterId = ancestorAtDepth(rows, prev, depth)
    if (afterId !== null) return { ok: true, parentId, depth, afterId }
  }
  // Otherwise it is the first child of its new parent: land before the first sibling, if any.
  const firstSibling = rows.find(
    (r, i) => outside(i) && r.parentId === parentId && r.depth === depth,
  )
  return firstSibling
    ? { ok: true, parentId, depth, beforeId: firstSibling.id }
    : { ok: true, parentId, depth }
}

/**
 * Walks up from `from` to its ancestor at `depth`. Safe on the visible rows: a collapsed node
 * hides its descendants, so every ancestor of a visible row is itself visible.
 */
function ancestorAtDepth(rows: FlatRow[], from: FlatRow, depth: number): string | null {
  let cur: FlatRow | undefined = from
  // Bounded by the row count so a malformed parent chain cannot spin.
  for (let guard = 0; cur && cur.depth > depth && guard <= rows.length; guard++) {
    cur = rows.find((r) => r.id === cur!.parentId)
  }
  return cur && cur.depth === depth ? cur.id : null
}
