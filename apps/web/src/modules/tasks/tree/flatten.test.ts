import { describe, expect, it } from 'vitest'
import { flatten, type TaskNode } from './flatten'

const node = (id: string, parentId: string | null, rank: string): TaskNode => ({
  id,
  parentId,
  rank,
  title: id,
  status: 'todo',
})

describe('flatten', () => {
  it('returns an empty list for no nodes', () => {
    expect(flatten([], new Set())).toEqual([])
  })

  it('orders siblings by rank then id', () => {
    // Equal ranks are legal (spec 5.3) and id is the documented tiebreak. Insertion order here
    // is deliberately not id order, so a sort on rank alone cannot pass by accident.
    // DB sorts ranks bytewise (COLLATE "C"), so uppercase ranks sort before lowercase (code point order).
    const nodes = [
      node('b', null, 'm'),
      node('a', null, 'm'),
      node('c', null, 'a'),
      node('root', null, 'Z'),
      node('nested1', 'root', 'z'),
      node('nested2', 'root', 'Z'),
    ]
    const ids = flatten(nodes, new Set()).map((r) => r.id)
    // Bytewise order: 'Z' < 'a' < 'm', then id tiebreak
    expect(ids).toEqual(['root', 'nested2', 'nested1', 'c', 'a', 'b'])
  })

  it('walks depth first with roots at depth 1', () => {
    const nodes = [
      node('root', null, 'a'),
      node('child', 'root', 'a'),
      node('grandchild', 'child', 'a'),
      node('root2', null, 'b'),
    ]
    expect(flatten(nodes, new Set()).map((r) => [r.id, r.depth])).toEqual([
      ['root', 1],
      ['child', 2],
      ['grandchild', 3],
      ['root2', 1],
    ])
  })

  it('reports subtreeHeight with a leaf at 1', () => {
    const nodes = [node('a', null, 'a'), node('b', 'a', 'a'), node('c', 'b', 'a')]
    expect(flatten(nodes, new Set()).map((r) => [r.id, r.subtreeHeight])).toEqual([
      ['a', 3],
      ['b', 2],
      ['c', 1],
    ])
  })

  it('takes the taller branch for subtreeHeight', () => {
    const nodes = [
      node('a', null, 'a'),
      node('tall', 'a', 'a'),
      node('taller', 'tall', 'a'),
      node('short', 'a', 'b'),
    ]
    const rows = flatten(nodes, new Set())
    expect(rows.find((r) => r.id === 'a')!.subtreeHeight).toBe(3)
    expect(rows.find((r) => r.id === 'tall')!.subtreeHeight).toBe(2)
    expect(rows.find((r) => r.id === 'taller')!.subtreeHeight).toBe(1)
    expect(rows.find((r) => r.id === 'short')!.subtreeHeight).toBe(1)
  })

  it('hides the descendants of a collapsed node but keeps the node', () => {
    const nodes = [node('a', null, 'a'), node('b', 'a', 'a'), node('c', 'b', 'a')]
    const rows = flatten(nodes, new Set(['a']))
    // Collapsed node is emitted, its descendants are hidden and not emitted
    expect(rows.map((r) => r.id)).toEqual(['a'])
    expect(rows[0]).toMatchObject({
      hasChildren: true,
      collapsed: true,
      depth: 1,
      subtreeHeight: 3,
    })
  })

  // subtreeHeight must describe the REAL subtree, not the visible one: Task 6 clamps the drag
  // depth with it, so counting only visible descendants would make an illegal drop look legal
  // whenever the dragged subtree happened to be folded.
  it('reports subtreeHeight of a collapsed node from all its descendants', () => {
    const nodes = [node('a', null, 'a'), node('b', 'a', 'a'), node('c', 'b', 'a')]
    expect(flatten(nodes, new Set(['a']))[0]!.subtreeHeight).toBe(3)
  })

  it('reports subtreeHeight of a middle collapsed node from all its descendants', () => {
    const nodes = [node('a', null, 'a'), node('b', 'a', 'a'), node('c', 'b', 'a')]
    const rows = flatten(nodes, new Set(['b']))
    // b is collapsed, so c is hidden and not emitted
    expect(rows.map((r) => r.id)).toEqual(['a', 'b'])
    expect(rows.find((r) => r.id === 'b')!.subtreeHeight).toBe(2)
  })

  // A parent soft-deleted between fetches would otherwise make its child vanish. Showing it in
  // the wrong place is visible and fixable; dropping it is silent.
  it('treats a node whose parent is absent as a root', () => {
    const nodes = [node('orphan', 'gone', 'a'), node('root', null, 'b')]
    const rows = flatten(nodes, new Set())
    expect(rows.map((r) => r.id)).toContain('orphan')
    expect(rows.find((r) => r.id === 'orphan')).toMatchObject({
      depth: 1,
      parentId: null,
    })
  })

  it('shows nodes on a parent cycle instead of dropping them', () => {
    // The API's guards make this unreachable, but silently losing tasks is the one outcome worth
    // coding against: a task that vanishes from the tree reads as lost work.
    const nodes = [
      node('a', 'b', 'a'),
      node('b', 'a', 'b'),
      node('c', 'a', 'a'),
      node('r', null, 'z'),
    ]
    const ids = flatten(nodes, new Set()).map((r) => r.id)
    // r is root (depth 1), then unreachable cycle nodes sorted by (rank, id): a, c, b
    expect(ids).toEqual(['r', 'a', 'c', 'b'])
    expect(new Set(ids).size).toBe(4) // No duplicate ids
  })

  it('shows cycle with tail sorted first (tail-first order)', () => {
    // Tail-first order: rank(t) < rank(a) = rank(b), so t sorts before cycle members.
    // All three should be shown flat, with no duplicates. r is root first, then unreachable in order t, a, b.
    const nodes = [
      node('a', 'b', 'b'),
      node('b', 'a', 'b'),
      node('t', 'a', 'a'), // tail, ranks before a and b
      node('r', null, 'z'),
    ]
    const rows = flatten(nodes, new Set())
    const ids = rows.map((r) => r.id)
    expect(ids).toEqual(['r', 't', 'a', 'b'])
    expect(new Set(ids).size).toBe(4) // No duplicate ids
  })

  it('shows collapsed cycle with children flat', () => {
    // Cycle a<->b with child c under b, and a is collapsed.
    // The walk never reaches the cycle (no entry from root), so all three are flat-emitted.
    // Note: a's collapsed flag is set but has no effect, as flat-emitted rows are roots and not descended.
    const nodes = [
      node('a', 'b', 'a'),
      node('b', 'a', 'a'),
      node('c', 'b', 'a'),
      node('r', null, 'z'),
    ]
    const rows = flatten(nodes, new Set(['a']))
    const ids = rows.map((r) => r.id)
    expect(ids).toEqual(['r', 'a', 'b', 'c'])
    expect(new Set(ids).size).toBe(4) // No duplicate ids
  })

  it('does not loop forever on a self-parent', () => {
    expect(flatten([node('a', 'a', 'a')], new Set()).map((r) => r.id)).toEqual(['a'])
  })

  it('never produces duplicate row ids', () => {
    const fixtures = [
      // Simple tree
      [node('a', null, 'a'), node('b', 'a', 'b')],
      // Cycle
      [node('a', 'b', 'a'), node('b', 'a', 'b')],
      // Tail-first cycle
      [node('a', 'b', 'b'), node('b', 'a', 'b'), node('t', 'a', 'a')],
      // Cycle with collapse
      [node('a', 'b', 'a'), node('b', 'a', 'a'), node('c', 'b', 'a')],
    ]
    for (const nodes of fixtures) {
      const rows = flatten(nodes, new Set())
      const ids = rows.map((r) => r.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('flat-emitted rows have depth 1 and parentId null (root invariant)', () => {
    // Task 6's drop.ts relies on the invariant: depth === 1 ⟺ parentId === null
    const nodes = [
      node('a', 'b', 'a'),
      node('b', 'a', 'b'),
      node('c', 'a', 'a'),
      node('r', null, 'z'),
    ]
    const rows = flatten(nodes, new Set())
    // r is a root, a/b/c are flat-emitted cycle members
    const aRow = rows.find((r) => r.id === 'a')!
    const bRow = rows.find((r) => r.id === 'b')!
    const cRow = rows.find((r) => r.id === 'c')!
    // Flat-emitted rows must be roots (depth 1, parentId null)
    expect(aRow).toMatchObject({ depth: 1, parentId: null })
    expect(bRow).toMatchObject({ depth: 1, parentId: null })
    expect(cRow).toMatchObject({ depth: 1, parentId: null })
  })
})
