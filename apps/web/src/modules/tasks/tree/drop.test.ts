import { describe, expect, it } from 'vitest'
import type { FlatRow } from './flatten'
import { MAX_TASK_DEPTH } from '@ctws/contracts'
import { planDrop } from './drop'

/** Builds visible rows from `[id, depth, subtreeHeight]`, deriving parentId from the depths. */
function rowsOf(spec: [string, number, number?][]): FlatRow<string>[] {
  const rows: FlatRow<string>[] = []
  const parentAtDepth = new Map<number, string>()
  for (const [id, depth, height = 1] of spec) {
    const parentId = depth === 1 ? null : (parentAtDepth.get(depth - 1) ?? null)
    parentAtDepth.set(depth, id)
    rows.push({ id, parentId, depth, subtreeHeight: height, hasChildren: false, collapsed: false })
  }
  for (const r of rows) r.hasChildren = rows.some((o) => o.parentId === r.id)
  return rows
}

/** Marks a row as folded: its subtree is hidden, but `subtreeHeight` still counts it. */
function fold(rows: FlatRow<string>[], id: string): FlatRow<string>[] {
  return rows.map((r) => (r.id === id ? { ...r, collapsed: true, hasChildren: true } : r))
}

describe('planDrop', () => {
  it('moves a row to the end of the roots', () => {
    const rows = rowsOf([
      ['a', 1],
      ['b', 1],
      ['c', 1],
    ])
    expect(planDrop({ rows, draggedId: 'a', slot: 3, wantedDepth: 1 })).toEqual({
      ok: true,
      parentId: null,
      afterId: 'c',
    })
  })

  it('makes a row the first child of the row above it', () => {
    const rows = rowsOf([
      ['parent', 1],
      ['existing', 2],
      ['dragged', 1],
    ])
    // As parent's first child, it lands before the child already there.
    expect(planDrop({ rows, draggedId: 'dragged', slot: 1, wantedDepth: 2 })).toEqual({
      ok: true,
      parentId: 'parent',
      beforeId: 'existing',
    })
  })

  it('lands before the FIRST of several existing children', () => {
    const rows = rowsOf([
      ['parent', 1],
      ['first', 2],
      ['second', 2],
      ['third', 2],
      ['dragged', 1],
    ])
    expect(planDrop({ rows, draggedId: 'dragged', slot: 1, wantedDepth: 2 })).toEqual({
      ok: true,
      parentId: 'parent',
      beforeId: 'first',
    })
  })

  it('becomes a child with no neighbour when the new parent is empty', () => {
    const rows = rowsOf([
      ['parent', 1],
      ['dragged', 1],
    ])
    expect(planDrop({ rows, draggedId: 'dragged', slot: 1, wantedDepth: 2 })).toEqual({
      ok: true,
      parentId: 'parent',
    })
  })

  it('clamps a depth deeper than the preceding row allows', () => {
    const rows = rowsOf([
      ['a', 1],
      ['dragged', 1],
    ])
    // You may become a's child (depth 2), never its grandchild in one gesture.
    expect(planDrop({ rows, draggedId: 'dragged', slot: 1, wantedDepth: 7 })).toMatchObject({
      ok: true,
      parentId: 'a',
    })
  })

  it('clamps a depth shallower than the following row allows', () => {
    // `b` is a child of `a`, not of the dragged row: the dragged row's own descendants travel with
    // it and would leave the lower bound at 1.
    const rows = rowsOf([
      ['a', 1],
      ['b', 2],
      ['dragged', 1],
    ])
    // Dropping between `a` and `b` at root depth would re-parent `b` under the dropped row, so the
    // depth is clamped up to `b`'s.
    expect(planDrop({ rows, draggedId: 'dragged', slot: 1, wantedDepth: 1 })).toMatchObject({
      ok: true,
      parentId: 'a',
    })
  })

  // Off by one here either rejects a legal drag or hands an illegal one to the server.
  it('lets a leaf reach exactly MAX_TASK_DEPTH', () => {
    const spec: [string, number, number?][] = []
    for (let d = 1; d <= MAX_TASK_DEPTH - 1; d++) spec.push([`d${d}`, d])
    spec.push(['leaf', 1, 1])
    const rows = rowsOf(spec)
    const plan = planDrop({
      rows,
      draggedId: 'leaf',
      slot: MAX_TASK_DEPTH - 1,
      wantedDepth: MAX_TASK_DEPTH,
    })
    expect(plan).toMatchObject({ ok: true, parentId: `d${MAX_TASK_DEPTH - 1}` })
  })

  it('refuses to put a leaf past MAX_TASK_DEPTH by clamping, not by erroring', () => {
    const spec: [string, number, number?][] = []
    for (let d = 1; d <= MAX_TASK_DEPTH; d++) spec.push([`d${d}`, d])
    spec.push(['leaf', 1, 1])
    const rows = rowsOf(spec)
    // The gesture asks for MAX_TASK_DEPTH + 1 under the deepest row; the deepest legal is MAX_TASK_DEPTH.
    expect(
      planDrop({ rows, draggedId: 'leaf', slot: MAX_TASK_DEPTH, wantedDepth: MAX_TASK_DEPTH + 1 }),
    ).toEqual({
      ok: true,
      parentId: `d${MAX_TASK_DEPTH - 1}`,
      afterId: `d${MAX_TASK_DEPTH}`,
    })
  })

  it('accounts for the dragged subtree height, not just the dragged row', () => {
    // A height-3 subtree may sit no deeper than MAX_TASK_DEPTH - 2, so under a depth-8 row (which
    // would make it depth 9) it must clamp to 8 instead.
    const spec: [string, number, number?][] = []
    for (let d = 1; d <= 8; d++) spec.push([`d${d}`, d])
    spec.push(['tall', 1, 3])
    // `tall` is folded: none of its descendants are visible, but the clamp uses its real height.
    const rows = fold(rowsOf(spec), 'tall')
    expect(planDrop({ rows, draggedId: 'tall', slot: 8, wantedDepth: 9 })).toEqual({
      ok: true,
      parentId: 'd7',
      afterId: 'd8',
    })
  })

  it('rejects a drop where no depth can fit the subtree', () => {
    // The row after the slot sets a lower bound of 9; a height-3 subtree's upper bound is
    // MAX_TASK_DEPTH - 2 = 8.
    const spec: [string, number, number?][] = []
    for (let d = 1; d <= 9; d++) spec.push([`d${d}`, d])
    spec.push(['d9b', 9])
    spec.push(['tall', 1, 3])
    const rows = fold(rowsOf(spec), 'tall')
    expect(planDrop({ rows, draggedId: 'tall', slot: 9, wantedDepth: 9 })).toEqual({
      ok: false,
      reason: 'too-deep',
    })
  })

  it('rejects a drop inside the dragged row own subtree', () => {
    const rows = rowsOf([
      ['dragged', 1, 3],
      ['child', 2, 2],
      ['grandchild', 3],
      ['other', 1],
    ])
    for (const slot of [1, 2]) {
      expect(planDrop({ rows, draggedId: 'dragged', slot, wantedDepth: 2 })).toEqual({
        ok: false,
        reason: 'own-subtree',
      })
    }
  })

  it('treats dropping back where it already is as unchanged', () => {
    const rows = rowsOf([
      ['a', 1],
      ['dragged', 1, 2],
      ['child', 2],
      ['b', 1],
    ])
    expect(planDrop({ rows, draggedId: 'dragged', slot: 1, wantedDepth: 1 })).toEqual({
      ok: false,
      reason: 'unchanged',
    })
    // Immediately after its own block is the same position too.
    expect(planDrop({ rows, draggedId: 'dragged', slot: 3, wantedDepth: 1 })).toEqual({
      ok: false,
      reason: 'unchanged',
    })
  })

  it('lands before the first root when dropped at the very top', () => {
    const rows = rowsOf([
      ['a', 1],
      ['dragged', 1],
    ])
    expect(planDrop({ rows, draggedId: 'dragged', slot: 0, wantedDepth: 1 })).toEqual({
      ok: true,
      parentId: null,
      beforeId: 'a',
    })
  })

  it('lands before the first of several roots when dropped at the very top', () => {
    const rows = rowsOf([
      ['a', 1],
      ['b', 1],
      ['dragged', 1],
    ])
    expect(planDrop({ rows, draggedId: 'dragged', slot: 0, wantedDepth: 1 })).toEqual({
      ok: true,
      parentId: null,
      beforeId: 'a',
    })
  })

  it('walks up to the right ancestor when outdenting past several levels', () => {
    const rows = rowsOf([
      ['x', 1],
      ['a', 1],
      ['a1', 2],
      ['a2', 3],
    ])
    const plan = (wantedDepth: number) => planDrop({ rows, draggedId: 'x', slot: 4, wantedDepth })
    expect(plan(1)).toEqual({ ok: true, parentId: null, afterId: 'a' })
    expect(plan(2)).toEqual({ ok: true, parentId: 'a', afterId: 'a1' })
    expect(plan(3)).toEqual({ ok: true, parentId: 'a1', afterId: 'a2' })
  })

  describe('dragging a nested row that has its own subtree', () => {
    // P > x > xc, then Q. x (depth 2, height 2) is the dragged row.
    const rows = rowsOf([
      ['P', 1],
      ['x', 2, 2],
      ['xc', 3],
      ['Q', 1],
    ])
    const plan = (slot: number, wantedDepth: number) =>
      planDrop({ rows, draggedId: 'x', slot, wantedDepth })

    it('moves it out to the root', () => {
      expect(plan(1, 1)).toEqual({ ok: true, parentId: null, afterId: 'P' })
      // Past its own block the neighbour above is still P, not its own child xc.
      expect(plan(3, 1)).toEqual({ ok: true, parentId: null, afterId: 'P' })
    })

    it('treats its own position as unchanged, at either edge of its block', () => {
      expect(plan(1, 2)).toEqual({ ok: false, reason: 'unchanged' })
      expect(plan(3, 2)).toEqual({ ok: false, reason: 'unchanged' })
      // xc is the dragged row's own descendant: it can never be the neighbour above, so the
      // gesture cannot reach depth 3 and clamps back to the row's own depth.
      expect(plan(3, 3)).toEqual({ ok: false, reason: 'unchanged' })
    })

    it('rejects a drop inside its own block', () => {
      expect(plan(2, 3)).toEqual({ ok: false, reason: 'own-subtree' })
    })
  })

  it('bounds the dragged block by the dragged depth, not by depth 1', () => {
    // y is x's sibling, so it is outside x's block. Treating the block as "everything deeper than
    // a root" would swallow y and call slot 3 an own-subtree drop.
    const rows = rowsOf([
      ['P', 1],
      ['x', 2, 2],
      ['xc', 3],
      ['y', 2],
      ['Q', 1],
    ])
    const plan = (slot: number, wantedDepth: number) =>
      planDrop({ rows, draggedId: 'x', slot, wantedDepth })
    expect(plan(3, 2)).toEqual({ ok: false, reason: 'unchanged' })
    // y below pins the lower bound at 2, so asking for the root clamps up to 2.
    expect(plan(3, 1)).toEqual({ ok: false, reason: 'unchanged' })
    expect(plan(4, 1)).toEqual({ ok: true, parentId: null, afterId: 'P' })
    expect(plan(4, 2)).toEqual({ ok: true, parentId: 'P', afterId: 'y' })
  })

  it('moves a nested row to a different parent, including at its block boundary', () => {
    const rows = rowsOf([
      ['A', 1],
      ['a1', 2],
      ['B', 1],
      ['x', 2, 2],
      ['xc', 3],
    ])
    const plan = (slot: number, wantedDepth: number) =>
      planDrop({ rows, draggedId: 'x', slot, wantedDepth })
    expect(plan(2, 2)).toEqual({ ok: true, parentId: 'A', afterId: 'a1' })
    // Slots 3 and 5 are the block's own edges. The slot alone does not make a drop "unchanged":
    // the parent changes at depth 1 and does not at depth 2.
    expect(plan(3, 1)).toEqual({ ok: true, parentId: null, afterId: 'B' })
    expect(plan(5, 1)).toEqual({ ok: true, parentId: null, afterId: 'B' })
    expect(plan(3, 2)).toEqual({ ok: false, reason: 'unchanged' })
    expect(plan(5, 2)).toEqual({ ok: false, reason: 'unchanged' })
  })

  it('never returns both beforeId and afterId', () => {
    // The API rejects a body carrying both, but only after the optimistic update has landed.
    const rows = rowsOf([
      ['a', 1],
      ['b', 1],
      ['c', 2],
      ['dragged', 1],
    ])
    let withAfter = 0
    let withBefore = 0
    let withNeither = 0
    for (let slot = 0; slot <= rows.length; slot++) {
      for (const wantedDepth of [1, 2, 3]) {
        const plan = planDrop({ rows, draggedId: 'dragged', slot, wantedDepth })
        if (plan.ok) {
          expect(plan.beforeId === undefined || plan.afterId === undefined).toBe(true)
          if (plan.afterId !== undefined) withAfter++
          else if (plan.beforeId !== undefined) withBefore++
          else withNeither++
        }
      }
    }
    // Guard against a vacuous pass: an implementation that refuses everything satisfies the loop.
    expect(withAfter).toBeGreaterThan(0)
    expect(withBefore).toBeGreaterThan(0)
    expect(withNeither).toBeGreaterThan(0)
  })
})
