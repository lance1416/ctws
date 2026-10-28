import { describe, expect, it } from 'vitest'
import { nowRows } from './nowRows'

describe("Now's rows", () => {
  it('fills with what is in progress, keeping two rows for what is ready', () => {
    expect(nowRows(8, 5, 5)).toEqual({ inProgress: 5, ready: 3 })
    expect(nowRows(6, 9, 5)).toEqual({ inProgress: 4, ready: 2 })
  })

  it('gives what is ready the rest of the room', () => {
    expect(nowRows(14, 5, 5)).toEqual({ inProgress: 5, ready: 5 })
    expect(nowRows(14, 1, 20)).toEqual({ inProgress: 1, ready: 13 })
  })

  it('keeps only as many rows for ready as there are ready', () => {
    expect(nowRows(6, 9, 1)).toEqual({ inProgress: 5, ready: 1 })
    expect(nowRows(6, 9, 0)).toEqual({ inProgress: 6, ready: 0 })
  })

  it('shares what little room there is', () => {
    expect(nowRows(1, 3, 3)).toEqual({ inProgress: 0, ready: 1 })
    expect(nowRows(0, 3, 3)).toEqual({ inProgress: 0, ready: 0 })
  })
})
