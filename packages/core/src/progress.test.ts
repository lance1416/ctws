import { describe, expect, it } from 'vitest'
import { rollup, type RollupNode, type RollupStatus } from './progress'

/** A live task with nothing interesting on it; override what the case is about. */
const node = (id: string, parentId: string | null, over: Partial<RollupNode> = {}): RollupNode => ({
  id,
  parentId,
  status: 'todo',
  manualProgress: null,
  overdue: false,
  dueSoon: false,
  lastActivityAt: null,
  ...over,
})

const progressOf = (nodes: RollupNode[], id: string) => rollup(nodes).get(id)!.progress

describe('progress, per spec §7.2', () => {
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
    // 0.5 would be a number nobody entered. Saying "half done" is what manualProgress is for.
    expect(progressOf([node('a', null, { status: 'in_progress' })], 'a')).toBe(0)
  })

  it('takes a leaf manual value even on a status that did not ask for one', () => {
    // Deliberately not cross-checked against the status (§7.2): an explicit value the person set
    // is not the system's to overrule.
    const nodes = [node('a', null, { status: 'todo', manualProgress: 0.4 })]
    expect(progressOf(nodes, 'a')).toBe(0.4)
  })

  it('lets done win over a manual value on the same leaf', () => {
    const nodes = [node('a', null, { status: 'done', manualProgress: 0.4 })]
    expect(progressOf(nodes, 'a')).toBe(1)
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
    // The parent says done; its children do not agree, and the children win (§6.4).
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
    const nodes = [
      node('a', null, { status: 'in_progress', manualProgress: 0.3 }),
      node('b', 'a', { status: 'backlog' }),
      node('c', 'a', { status: 'cancelled' }),
    ]
    expect(progressOf(nodes, 'a')).toBe(0.3)
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

describe('the counts beside the percentage, per spec §7.3', () => {
  it('counts the subtree including the node itself', () => {
    const nodes = [
      node('a', null, { status: 'in_progress' }),
      node('b', 'a', { status: 'done' }),
      node('c', 'a', { status: 'backlog' }),
    ]
    expect(rollup(nodes).get('a')!.counts).toEqual({
      backlog: 1,
      todo: 0,
      in_progress: 1,
      done: 1,
      cancelled: 0,
    })
    expect(rollup(nodes).get('b')!.counts.done).toBe(1)
  })

  it('counts an excluded node, because a count is not a percentage', () => {
    // 「42% · 2 进行中 · 1 已逾期」 has to be able to say that something IS in the backlog; the
    // exclusion rule is about averaging, not about existing.
    const nodes = [node('a', null, { status: 'backlog' }), node('b', 'a', { status: 'cancelled' })]
    const r = rollup(nodes).get('a')!
    expect(r.progress).toBeNull()
    expect(r.counts).toEqual({ backlog: 1, todo: 0, in_progress: 0, done: 0, cancelled: 1 })
  })

  it('sums overdue and due-soon up the tree', () => {
    const nodes = [
      node('a', null),
      node('b', 'a', { overdue: true }),
      node('c', 'a', { dueSoon: true }),
      node('d', 'c', { overdue: true, dueSoon: false }),
    ]
    const r = rollup(nodes)
    expect(r.get('a')).toMatchObject({ overdue: 2, dueSoon: 1 })
    expect(r.get('c')).toMatchObject({ overdue: 1, dueSoon: 1 })
    expect(r.get('d')).toMatchObject({ overdue: 1, dueSoon: 0 })
  })
})

describe('last activity, per spec §7.4', () => {
  it('reports the most recent change anywhere in the subtree', () => {
    const nodes = [
      node('a', null, { lastActivityAt: '2026-09-01T10:00:00.000Z' }),
      node('b', 'a', { lastActivityAt: '2026-10-05T08:30:00.000Z' }),
      node('c', 'b', { lastActivityAt: '2026-09-20T23:59:59.000Z' }),
    ]
    const r = rollup(nodes)
    expect(r.get('a')!.lastActivityAt).toBe('2026-10-05T08:30:00.000Z')
    expect(r.get('b')!.lastActivityAt).toBe('2026-10-05T08:30:00.000Z')
    // A node reports its OWN subtree, so the deepest one keeps its own date.
    expect(r.get('c')!.lastActivityAt).toBe('2026-09-20T23:59:59.000Z')
  })

  it('is null only when nothing in the subtree has ever been logged', () => {
    const nodes = [node('a', null), node('b', 'a', { lastActivityAt: '2026-10-05T08:30:00.000Z' })]
    expect(rollup(nodes).get('a')!.lastActivityAt).toBe('2026-10-05T08:30:00.000Z')
    expect(rollup([node('x', null)]).get('x')!.lastActivityAt).toBeNull()
  })

  it('compares the fixed-width UTC form, where string order IS time order', () => {
    // The fold takes a plain string max. That is only the chronological max for this exact
    // shape -- same width, same `Z`. A December instant must beat a September one although
    // '1' < '9'; it does, because the year and month sit to the left of the day.
    const nodes = [
      node('a', null),
      node('b', 'a', { lastActivityAt: '2026-09-30T23:59:59.999Z' }),
      node('c', 'a', { lastActivityAt: '2026-12-01T00:00:00.000Z' }),
    ]
    expect(rollup(nodes).get('a')!.lastActivityAt).toBe('2026-12-01T00:00:00.000Z')
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
    expect(r.get('b')!.counts.done).toBe(1)
  })

  it('is empty for no nodes at all', () => {
    expect(rollup([]).size).toBe(0)
  })
})
