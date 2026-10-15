import type { TaskResponse } from '@ctws/contracts'
import { describe, expect, it } from 'vitest'
import { applyMove } from './applyMove'

const P = 'project'
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
    expect(shape(applyMove(TREE, 'd', { projectId: P, parentId: 'a' }))).toEqual([
      'top: a',
      'a: b c d',
    ])
  })

  it('puts a row before a sibling under the same parent', () => {
    expect(shape(applyMove(TREE, 'c', { projectId: P, parentId: 'a', beforeId: 'b' }))).toEqual([
      'top: a d',
      'a: c b',
    ])
  })

  it('puts a row after a sibling', () => {
    expect(shape(applyMove(TREE, 'd', { projectId: P, parentId: 'a', afterId: 'b' }))).toEqual([
      'top: a',
      'a: b d c',
    ])
  })

  it('lifts a row to the top level', () => {
    expect(shape(applyMove(TREE, 'b', { projectId: P, parentId: null, afterId: 'a' }))).toEqual([
      'top: a b d',
      'a: c',
    ])
  })

  it('takes the moved row’s children with it, their parent unchanged', () => {
    const moved = applyMove(TREE, 'a', { projectId: P, parentId: 'd' })
    expect(shape(moved)).toEqual(['top: d', 'a: b c', 'd: a'])
    expect(moved.find((x) => x.id === 'b')?.parentId).toBe('a')
  })

  it('returns the list untouched for an id it does not hold', () => {
    expect(applyMove(TREE, 'zz', { projectId: P, parentId: null })).toBe(TREE)
  })
})
