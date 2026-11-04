import { idFrom, projectId, taskId, type TaskResponse } from '@ctws/contracts'
import { describe, expect, it } from 'vitest'
import { applyMove, placeOf } from './applyMove'

const P = idFrom(projectId, 'project')
const id = (s: string) => idFrom(taskId, s)
/** A task with only what a move reads: its id, its parent and its rank. */
const t = (id: string, parentId: string | null, rank: string) =>
  ({ id, parentId, rank }) as TaskResponse

/** The tree as `parent: child child …`, children in rank order — what the rows would show. */
function shape(tasks: TaskResponse[]): string[] {
  const parents = [null, ...tasks.map((x) => x.id)]
  return parents.flatMap((p) => {
    const kids = tasks
      .filter((x) => x.parentId === p)
      .sort((a, b) => (a.rank < b.rank ? -1 : 1))
      .map((x) => x.id)
    return kids.length ? [`${p ?? 'top'}: ${kids.join(' ')}`] : []
  })
}

//   a          a has b and c; d is a root of its own
//   ├ b
//   └ c
//   d
const TREE = [t('a', null, '1'), t('b', 'a', '1'), t('c', 'a', '2'), t('d', null, '2')]

describe('applyMove', () => {
  it('puts a row last under another parent', () => {
    expect(shape(applyMove(TREE, id('d'), { projectId: P, parentId: id('a') }))).toEqual([
      'top: a',
      'a: b c d',
    ])
  })

  it('puts a row before a sibling under the same parent', () => {
    expect(
      shape(applyMove(TREE, id('c'), { projectId: P, parentId: id('a'), beforeId: id('b') })),
    ).toEqual(['top: a d', 'a: c b'])
  })

  it('puts a row after a sibling', () => {
    expect(
      shape(applyMove(TREE, id('d'), { projectId: P, parentId: id('a'), afterId: id('b') })),
    ).toEqual(['top: a', 'a: b d c'])
  })

  it('lifts a row to the top level', () => {
    expect(
      shape(applyMove(TREE, id('b'), { projectId: P, parentId: null, afterId: id('a') })),
    ).toEqual(['top: a b d', 'a: c'])
  })

  it('takes the moved row’s children with it, their parent unchanged', () => {
    const moved = applyMove(TREE, id('a'), { projectId: P, parentId: id('d') })
    expect(shape(moved)).toEqual(['top: d', 'a: b c', 'd: a'])
    expect(moved.find((x) => x.id === 'b')?.parentId).toBe('a')
  })

  it('returns the list untouched for an id it does not hold', () => {
    expect(applyMove(TREE, id('zz'), { projectId: P, parentId: null })).toBe(TREE)
  })
})

describe('placeOf', () => {
  it('names the sibling after a row, and moving there undoes a move', () => {
    expect(placeOf(TREE, id('b'), P)).toEqual({ projectId: P, parentId: 'a', beforeId: 'c' })
    const moved = applyMove(TREE, id('b'), { projectId: P, parentId: null })
    const back = applyMove(moved, id('b'), placeOf(TREE, id('b'), P)!)
    expect(shape(back)).toEqual(shape(TREE))
  })

  it('names the sibling before a row that is last, and nothing for an only child', () => {
    expect(placeOf(TREE, id('c'), P)).toEqual({ projectId: P, parentId: 'a', afterId: 'b' })
    const only = [t('a', null, '1'), t('b', 'a', '1')]
    expect(placeOf(only, id('b'), P)).toEqual({ projectId: P, parentId: 'a' })
  })

  it('knows nothing of a task it does not hold', () => {
    expect(placeOf(TREE, id('z'), P)).toBeNull()
  })
})
