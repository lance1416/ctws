import { describe, expect, it } from 'vitest'
import { fillOf } from './ProgressSquare'

const counts = (done: number, counted: number, backlog = 0) => ({ done, counted, backlog })

describe('fillOf', () => {
  it('fills in quarter steps of what is done (artboard 32)', () => {
    expect(fillOf(counts(0, 4))).toBe(0)
    expect(fillOf(counts(1, 4))).toBe(25)
    expect(fillOf(counts(2, 4))).toBe(50)
    expect(fillOf(counts(2, 3))).toBe(50)
    expect(fillOf(counts(3, 4))).toBe(75)
    expect(fillOf(counts(9, 10))).toBe(75)
  })

  it('says how it ended: all done, all cancelled, all the rest in the backlog', () => {
    expect(fillOf(counts(4, 4))).toBe('check')
    expect(fillOf(counts(0, 0))).toBe('x')
    expect(fillOf(counts(0, 0, 3))).toBe('dash')
    // The backlog does not count: two of the four counted are done, with two more waiting.
    expect(fillOf(counts(2, 4, 2))).toBe(50)
  })
})
