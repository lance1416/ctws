import { MAX_TASK_DEPTH } from '@ctws/contracts'
import type { FlatRow } from './flatten'

type DropRequest<Id extends string> = {
  /** The visible rows, in display order. */
  rows: readonly FlatRow<Id>[]
  draggedId: Id
  /** Insertion slot, 0..rows.length: the row lands between `rows[slot - 1]` and `rows[slot]`. */
  slot: number
  /** The depth the gesture is asking for, derived from the horizontal offset. */
  wantedDepth: number
}

type DropPlan<Id extends string> =
  | { ok: true; parentId: Id | null; beforeId?: Id; afterId?: Id }
  | { ok: false; reason: 'own-subtree' | 'too-deep' | 'unchanged' }

/**
 * Translates a drag into one move call. The API enforces the same rules, but a drop refused up
 * front is better than one that is allowed and then snaps back.
 */
export function planDrop<Id extends string>(req: DropRequest<Id>): DropPlan<Id> {
  const { rows, draggedId, slot, wantedDepth } = req
  const index = rows.findIndex((r) => r.id === draggedId)
  if (index < 0) return { ok: false, reason: 'unchanged' }
  const dragged = rows[index]!

  // The dragged row's block, itself and the deeper rows right after it, travels with it.
  let end = index + 1
  while (end < rows.length && rows[end]!.depth > dragged.depth) end++

  // A slot strictly inside the block is a drop into the row's own subtree.
  if (slot > index && slot < end) return { ok: false, reason: 'own-subtree' }

  const outside = (i: number) => i < index || i >= end
  let prev: FlatRow<Id> | null = null
  for (let i = slot - 1; i >= 0; i--) {
    if (outside(i)) {
      prev = rows[i]!
      break
    }
  }
  let next: FlatRow<Id> | null = null
  for (let i = slot; i < rows.length; i++) {
    if (outside(i)) {
      next = rows[i]!
      break
    }
  }

  // Upper bound from the row above: you may become its child, never deeper in one gesture.
  const maxByPrev = prev ? prev.depth + 1 : 1
  // Upper bound from the subtree's height, mirroring the API's `parentDepth + liveHeight >
  // MAX_TASK_DEPTH` rejection: a leaf may reach MAX_TASK_DEPTH, a height-3 subtree two less.
  const maxByHeight = MAX_TASK_DEPTH - (dragged.subtreeHeight - 1)
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

  // Exactly one of beforeId/afterId, or neither: the API rejects a body carrying both.
  if (prev && prev.depth >= depth) {
    // The row follows whichever of prev's ancestors-or-self sits at the new depth.
    const afterId = ancestorAtDepth(rows, prev, depth)
    if (afterId !== null) return { ok: true, parentId, afterId }
  }
  // Otherwise it is the first child of its new parent: land before the first sibling, if any.
  const firstSibling = rows.find(
    (r, i) => outside(i) && r.parentId === parentId && r.depth === depth,
  )
  return firstSibling ? { ok: true, parentId, beforeId: firstSibling.id } : { ok: true, parentId }
}

/**
 * Walks up from `from` to its ancestor at `depth`. Safe on the visible rows: a collapsed node
 * hides its descendants, so every ancestor of a visible row is itself visible.
 */
function ancestorAtDepth<Id extends string>(
  rows: readonly FlatRow<Id>[],
  from: FlatRow<Id>,
  depth: number,
): Id | null {
  let cur: FlatRow<Id> | undefined = from
  // Bounded by the row count so a malformed parent chain cannot spin.
  for (let guard = 0; cur && cur.depth > depth && guard <= rows.length; guard++) {
    cur = rows.find((r) => r.id === cur!.parentId)
  }
  return cur && cur.depth === depth ? cur.id : null
}
