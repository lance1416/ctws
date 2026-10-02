import { describe, expect, it } from 'vitest'
import type { FlatRow } from './flatten'
import { MAX_DEPTH, planDrop } from './drop'

/** Builds visible rows from `[id, depth, subtreeHeight]`, deriving parentId from the depths. */
function rowsOf(spec: [string, number, number?][]): FlatRow[] {
  const rows: FlatRow[] = []
  const parentAtDepth = new Map<number, string>()
  for (const [id, depth, height = 1] of spec) {
    const parentId = depth === 1 ? null : (parentAtDepth.get(depth - 1) ?? null)
    parentAtDepth.set(depth, id)
    rows.push({ id, parentId, depth, subtreeHeight: height, hasChildren: false, collapsed: false })
  }
  for (const r of rows) r.hasChildren = rows.some((o) => o.parentId === r.id)
  return rows
}

describe('planDrop', () => {
  it('moves a row to the end of the roots', () => {
    const rows = rowsOf([
      ['a', 1],
      ['b', 1],
      ['c', 1],
    ])
    // Dropping 'a' after the last row, at root depth: it becomes the last root.
    expect(planDrop({ rows, draggedId: 'a', slot: 3, wantedDepth: 1 })).toEqual({
      ok: true,
      parentId: null,
      depth: 1,
      afterId: 'c',
    })
  })

  it('makes a row the first child of the row above it', () => {
    const rows = rowsOf([
      ['parent', 1],
      ['existing', 2],
      ['dragged', 1],
    ])
    // Slot 1 is directly under `parent`, indented one level: dragged becomes parent's FIRST
    // child, so it must land before the child that is already there.
    expect(planDrop({ rows, draggedId: 'dragged', slot: 1, wantedDepth: 2 })).toEqual({
      ok: true,
      parentId: 'parent',
      depth: 2,
      beforeId: 'existing',
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
      depth: 2,
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
      depth: 2,
      parentId: 'a',
    })
  })

  it('clamps a depth shallower than the following row allows', () => {
    // `b` must be a child of `a`, NOT of the dragged row: a descendant of the dragged row travels
    // with the drag and is never a candidate neighbour, which would leave the lower bound at 1 and
    // make this test pass for the wrong reason.
    const rows = rowsOf([
      ['a', 1],
      ['b', 2],
      ['dragged', 1],
    ])
    // Dropping between `a` and `b` at root depth would re-parent `b` under the dropped row, so the
    // depth is clamped up to `b`'s.
    expect(planDrop({ rows, draggedId: 'dragged', slot: 1, wantedDepth: 1 })).toMatchObject({
      ok: true,
      depth: 2,
      parentId: 'a',
    })
  })

  // Review Focus 4. The arithmetic mirrors the API's `parentDepth + liveHeight > MAX_DEPTH`.
  // Off by one here either rejects a legal drag or hands an illegal one to the server.
  it('lets a leaf reach exactly MAX_DEPTH', () => {
    const spec: [string, number, number?][] = []
    for (let d = 1; d <= MAX_DEPTH - 1; d++) spec.push([`d${d}`, d])
    spec.push(['leaf', 1, 1])
    const rows = rowsOf(spec)
    const plan = planDrop({
      rows,
      draggedId: 'leaf',
      slot: MAX_DEPTH - 1,
      wantedDepth: MAX_DEPTH,
    })
    expect(plan).toMatchObject({ ok: true, depth: MAX_DEPTH, parentId: `d${MAX_DEPTH - 1}` })
  })

  it('refuses to put a leaf past MAX_DEPTH by clamping, not by erroring', () => {
    const spec: [string, number, number?][] = []
    for (let d = 1; d <= MAX_DEPTH; d++) spec.push([`d${d}`, d])
    spec.push(['leaf', 1, 1])
    const rows = rowsOf(spec)
    // The gesture asks for MAX_DEPTH + 1 under the deepest row; the deepest legal depth is MAX_DEPTH.
    expect(
      planDrop({ rows, draggedId: 'leaf', slot: MAX_DEPTH, wantedDepth: MAX_DEPTH + 1 }),
    ).toMatchObject({
      ok: true,
      depth: MAX_DEPTH,
    })
  })

  it('accounts for the dragged subtree height, not just the dragged row', () => {
    // A height-3 subtree may sit no deeper than MAX_DEPTH - 2, so under a depth-8 row (which
    // would make it depth 9) it must clamp to 8 instead.
    const spec: [string, number, number?][] = []
    for (let d = 1; d <= 8; d++) spec.push([`d${d}`, d])
    spec.push(['tall', 1, 3])
    const rows = rowsOf(spec)
    expect(planDrop({ rows, draggedId: 'tall', slot: 8, wantedDepth: 9 })).toMatchObject({
      ok: true,
      depth: 8,
    })
  })

  it('rejects a drop where no depth can fit the subtree', () => {
    // The lower bound comes from the row AFTER the slot, so there has to be one: with nothing
    // below, the bound is 1 and the drop would merely clamp instead of being refused. Two sibling
    // rows at depth 9 give a slot whose lower bound is 9, against an upper bound of
    // MAX_DEPTH - 2 = 8 for a height-3 subtree -- so no depth fits.
    const spec: [string, number, number?][] = []
    for (let d = 1; d <= 9; d++) spec.push([`d${d}`, d])
    spec.push(['d9b', 9])
    spec.push(['tall', 1, 3])
    const rows = rowsOf(spec)
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
      depth: 1,
      beforeId: 'a',
    })
  })

  it('never returns both beforeId and afterId', () => {
    // The API rejects a body carrying both with a 400, so a plan with both is a bug the server
    // would only catch after the optimistic update had already been applied.
    const rows = rowsOf([
      ['a', 1],
      ['b', 1],
      ['c', 2],
      ['dragged', 1],
    ])
    for (let slot = 0; slot <= rows.length; slot++) {
      for (const wantedDepth of [1, 2, 3]) {
        const plan = planDrop({ rows, draggedId: 'dragged', slot, wantedDepth })
        if (plan.ok) {
          expect(plan.beforeId === undefined || plan.afterId === undefined).toBe(true)
        }
      }
    }
  })
})
