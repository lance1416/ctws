import { idFrom, taskId, type TaskStatus } from '@ctws/contracts'
import { describe, expect, it } from 'vitest'
import { leafCounts } from './leafCounts'

const id = (n: string) => idFrom(taskId, `00000000-0000-0000-0000-${n.padStart(12, '0')}`)
const node = (n: string, parent: string | null, status: TaskStatus = 'todo') => ({
  id: id(n),
  parentId: parent === null ? null : id(parent),
  status,
})

describe('leafCounts', () => {
  it('counts a parent’s leaves at any depth, never the parents between (artboard 8)', () => {
    // Amazon: SDE II's four, one of them done, and one more directly under Amazon.
    const counts = leafCounts([
      node('1', null),
      node('2', '1'),
      node('3', '2', 'done'),
      node('4', '2', 'in_progress'),
      node('5', '2'),
      node('6', '2'),
      node('7', '1'),
    ])
    expect(counts.get(id('1'))).toEqual({ done: 1, counted: 5, backlog: 0 })
    expect(counts.get(id('2'))).toEqual({ done: 1, counted: 4, backlog: 0 })
    // A leaf has its own status, not counts.
    expect(counts.has(id('3'))).toBe(false)
  })

  it('leaves the backlog and the cancelled out of what counts, and says the backlog apart', () => {
    const counts = leafCounts([
      node('1', null),
      node('2', '1', 'backlog'),
      node('3', '1', 'cancelled'),
      node('4', '1', 'done'),
    ])
    expect(counts.get(id('1'))).toEqual({ done: 1, counted: 1, backlog: 1 })
  })
})
