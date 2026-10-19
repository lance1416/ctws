import type { TaskStatus } from '@ctws/contracts'
import { describe, expect, it } from 'vitest'
import { derivedStatus } from './status'

describe('derivedStatus', () => {
  it('has nothing to say about a leaf', () => {
    expect(derivedStatus([])).toBeNull()
  })

  it.each<[TaskStatus[], TaskStatus]>([
    // FR-038's own example: Done, Cancelled, To do.
    [['done', 'cancelled', 'todo'], 'in_progress'],
    [['done', 'cancelled', 'done'], 'done'],
    [['done', 'cancelled', 'cancelled'], 'done'],
    [['cancelled', 'cancelled'], 'cancelled'],
    [['cancelled'], 'cancelled'],
    [['done'], 'done'],
    [['in_progress', 'todo'], 'in_progress'],
    [['done', 'todo'], 'in_progress'],
    [['done', 'backlog'], 'in_progress'],
    [['backlog', 'backlog'], 'backlog'],
    [['backlog', 'todo'], 'todo'],
    [['todo'], 'todo'],
    // Cancelled steps beside open ones are neither closed nor started.
    [['cancelled', 'todo'], 'todo'],
    [['cancelled', 'backlog'], 'todo'],
  ])('%j -> %s', (children, expected) => {
    expect(derivedStatus(children)).toBe(expected)
  })
})
