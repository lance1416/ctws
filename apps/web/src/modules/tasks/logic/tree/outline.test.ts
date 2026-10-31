import { idFrom, taskId, type TaskStatus } from '@ctws/contracts'
import { describe, expect, it } from 'vitest'
import { outlineRows } from './outline'

const id = (n: string) => idFrom(taskId, `00000000-0000-0000-0000-${n.padStart(12, '0')}`)
const node = (n: string, parent: string | null, status: TaskStatus = 'todo') => ({
  id: id(n),
  parentId: parent === null ? null : id(parent),
  rank: n.padStart(4, '0'),
  status,
})

describe('the sidebar outline of a project', () => {
  it('lists its parents at every depth and its own leaves, in the tree’s order', () => {
    const rows = outlineRows([
      node('1', null),
      node('2', '1'),
      node('3', '2'),
      node('4', '1'),
      node('5', null),
    ])
    // 3 and 4 are leaves under a parent: the page shows them.
    expect(rows.map((r) => [r.id, r.depth])).toEqual([
      [id('1'), 1],
      [id('2'), 2],
      [id('5'), 1],
    ])
  })

  it('leaves out what is finished, a leaf or a parent with everything under it', () => {
    const rows = outlineRows([
      node('1', null, 'done'),
      node('2', '1'),
      node('3', '2'),
      node('4', null, 'cancelled'),
      node('5', '4'),
      node('6', null),
      node('7', '6', 'done'),
      node('8', null, 'done'),
      node('9', null, 'in_progress'),
    ])
    expect(rows.map((r) => r.id)).toEqual([id('6'), id('9')])
  })
})
