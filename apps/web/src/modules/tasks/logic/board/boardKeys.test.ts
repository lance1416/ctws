import { idFrom, taskId } from '@ctws/contracts'
import { describe, expect, it } from 'vitest'
import { cardBeside, statusBeside, type ShownColumn } from './boardKeys'

const id = (n: number) => idFrom(taskId, `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`)

// To do shows three cards, In progress none, Done two.
const board: ShownColumn[] = [
  { status: 'todo', ids: [id(1), id(2), id(3)] },
  { status: 'in_progress', ids: [] },
  { status: 'done', ids: [id(4), id(5)] },
]

describe('cardBeside', () => {
  it('goes up and down within a column and stops at its ends', () => {
    expect(cardBeside(board, id(2), 'ArrowDown')).toBe(id(3))
    expect(cardBeside(board, id(2), 'ArrowUp')).toBe(id(1))
    expect(cardBeside(board, id(3), 'ArrowDown')).toBe(id(3))
    expect(cardBeside(board, id(1), 'ArrowUp')).toBe(id(1))
  })

  it('goes sideways to the same place, past an empty column, or to the last card of a shorter one', () => {
    expect(cardBeside(board, id(1), 'ArrowRight')).toBe(id(4))
    expect(cardBeside(board, id(3), 'ArrowRight')).toBe(id(5))
    expect(cardBeside(board, id(5), 'ArrowLeft')).toBe(id(2))
    expect(cardBeside(board, id(4), 'ArrowRight')).toBe(id(4))
  })
})

describe('statusBeside', () => {
  it('steps through the board’s order, strips included, and not past its ends', () => {
    expect(statusBeside('todo', -1)).toBe('backlog')
    expect(statusBeside('todo', 1)).toBe('in_progress')
    expect(statusBeside('done', 1)).toBe('cancelled')
    expect(statusBeside('cancelled', 1)).toBeNull()
    expect(statusBeside('backlog', -1)).toBeNull()
  })
})
