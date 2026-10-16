import { describe, expect, it } from 'vitest'
import { rollup, type RollupNode, type RollupStatus } from './progress'

/** A live task with nothing interesting on it; override what the case is about. */
const node = (id: string, parentId: string | null, over: Partial<RollupNode> = {}): RollupNode => ({
  id,
  parentId,
  status: 'todo',
  overdue: false,
  ...over,
})

const progressOf = (nodes: RollupNode[], id: string) => rollup(nodes).get(id)!.progress

describe('progress', () => {
  it.each<[RollupStatus, number | null]>([
    ['backlog', null],
    ['cancelled', null],
    ['todo', 0],
    ['in_progress', 0],
    ['done', 1],
  ])('scores a bare %s leaf as %s', (status, expected) => {
    expect(progressOf([node('a', null, { status })], 'a')).toBe(expected)
  })

  it('scores an in-progress leaf 0 rather than inventing a half', () => {
    // 0.5 would be a number nobody entered.
    expect(progressOf([node('a', null, { status: 'in_progress' })], 'a')).toBe(0)
  })

  it('averages the DIRECT children, not the subtree leaves', () => {
    // b is 1 on its own; c is the mean of two leaves, 0.5. The parent is (1 + 0.5) / 2 = 0.75.
    // Leaf counting would give 2/3 here, and would DROP as soon as anyone broke work down --
    // which is the behaviour this tool is trying to encourage.
    const nodes = [
      node('a', null),
      node('b', 'a', { status: 'done' }),
      node('c', 'a'),
      node('d', 'c', { status: 'done' }),
      node('e', 'c', { status: 'todo' }),
    ]
    expect(progressOf(nodes, 'c')).toBe(0.5)
    expect(progressOf(nodes, 'a')).toBe(0.75)
  })

  it("lets the derived value override the parent's own status", () => {
    // The parent says done; its children do not agree, and the children win.
    const nodes = [
      node('a', null, { status: 'done' }),
      node('b', 'a', { status: 'done' }),
      node('c', 'a', { status: 'todo' }),
    ]
    expect(progressOf(nodes, 'a')).toBe(0.5)
  })

  it('ignores excluded children when averaging', () => {
    const nodes = [
      node('a', null),
      node('b', 'a', { status: 'done' }),
      node('c', 'a', { status: 'backlog' }),
      node('d', 'a', { status: 'cancelled' }),
    ]
    // Only b counts, so the parent is 1 -- not 1/3, which is what counting the excluded ones in
    // would give and would mean that filing something as backlog drags its parent down.
    expect(progressOf(nodes, 'a')).toBe(1)
  })

  it('degrades to a leaf when every child is excluded', () => {
    const children = [
      node('b', 'a', { status: 'backlog' }),
      node('c', 'a', { status: 'cancelled' }),
    ]
    expect(progressOf([node('a', null, { status: 'in_progress' }), ...children], 'a')).toBe(0)
    expect(progressOf([node('a', null, { status: 'done' }), ...children], 'a')).toBe(1)
  })

  it('excludes a backlog parent whatever its children say', () => {
    const nodes = [node('a', null, { status: 'backlog' }), node('b', 'a', { status: 'done' })]
    expect(progressOf(nodes, 'a')).toBeNull()
    // The child keeps its own number: exclusion is about the node, not about the subtree.
    expect(progressOf(nodes, 'b')).toBe(1)
  })

  it('averages three levels the same way at every level', () => {
    const nodes = [
      node('root', null),
      node('x', 'root', { status: 'done' }),
      node('y', 'root'),
      node('y1', 'y', { status: 'done' }),
      node('y2', 'y'),
      node('y2a', 'y2', { status: 'done' }),
      node('y2b', 'y2', { status: 'done' }),
    ]
    expect(progressOf(nodes, 'y2')).toBe(1)
    expect(progressOf(nodes, 'y')).toBe(1)
    expect(progressOf(nodes, 'root')).toBe(1)
  })
})

describe('the counts beside the percentage', () => {
  it('counts in-progress tasks across the subtree, the node itself included', () => {
    const nodes = [
      node('a', null, { status: 'in_progress' }),
      node('b', 'a', { status: 'in_progress' }),
      node('c', 'b', { status: 'in_progress' }),
      node('d', 'a', { status: 'backlog' }),
    ]
    const r = rollup(nodes)
    expect(r.get('a')!.inProgress).toBe(3)
    expect(r.get('b')!.inProgress).toBe(2)
    expect(r.get('d')!.inProgress).toBe(0)
  })

  it('counts under an excluded node, because a count is not a percentage', () => {
    const nodes = [
      node('a', null, { status: 'backlog' }),
      node('b', 'a', { status: 'in_progress' }),
    ]
    const r = rollup(nodes).get('a')!
    expect(r.progress).toBeNull()
    expect(r.inProgress).toBe(1)
  })

  it('sums overdue up the tree', () => {
    const nodes = [
      node('a', null),
      node('b', 'a', { overdue: true }),
      node('c', 'a'),
      node('d', 'c', { overdue: true }),
    ]
    const r = rollup(nodes)
    expect(r.get('a')!.overdue).toBe(2)
    expect(r.get('c')!.overdue).toBe(1)
    expect(r.get('d')!.overdue).toBe(1)
  })
})

describe('inputs that are not a clean tree', () => {
  it('returns a rollup for every node it was given', () => {
    const nodes = [node('a', null), node('b', 'a'), node('c', 'b')]
    expect([...rollup(nodes).keys()].sort()).toEqual(['a', 'b', 'c'])
  })

  it('treats a child whose parent is absent as a root', () => {
    // The parent can be soft-deleted between fetches. Dropping the child here would make the
    // numbers quietly wrong, which is worse than an orphan counted at the top.
    const nodes = [node('orphan', 'gone', { status: 'done' })]
    const r = rollup(nodes)
    expect(r.get('orphan')).toMatchObject({ progress: 1 })
  })

  it('does not hang on a parent cycle, and still reports every node', () => {
    // `move` refuses to make one, so this is a guard rather than a case: the fold must terminate
    // on input the database should never hold.
    const nodes = [node('a', 'b'), node('b', 'a', { status: 'done' })]
    const r = rollup(nodes)
    expect([...r.keys()].sort()).toEqual(['a', 'b'])
    expect(r.get('b')!.progress).toBe(1)
  })

  it('is empty for no nodes at all', () => {
    expect(rollup([]).size).toBe(0)
  })
})
