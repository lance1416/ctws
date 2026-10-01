import { describe, expect, it } from 'vitest'
import { rankBetween } from './rank'

describe('rankBetween', () => {
  it('produces a first key when there is nothing on either side', () => {
    expect(rankBetween(null, null)).toMatch(/^[0-9A-Za-z]+$/)
  })

  it('produces a key that sorts after the one before it', () => {
    const a = rankBetween(null, null)
    const b = rankBetween(a, null)
    expect(b > a).toBe(true)
  })

  it('produces a key that sorts before the one after it', () => {
    const b = rankBetween(null, null)
    const a = rankBetween(null, b)
    expect(a < b).toBe(true)
  })

  it('produces a key strictly between two neighbours', () => {
    const a = rankBetween(null, null)
    const c = rankBetween(a, null)
    const b = rankBetween(a, c)
    expect(a < b).toBe(true)
    expect(b < c).toBe(true)
  })

  // The whole point of a fractional index: inserting between two adjacent keys must not
  // require renumbering anything. Repeat it enough times that a naive midpoint-of-integers
  // implementation runs out of room and fails.
  it('can insert between adjacent keys 200 times without renumbering', () => {
    let lo = rankBetween(null, null)
    let hi = rankBetween(lo, null)
    for (let i = 0; i < 200; i++) {
      const mid = rankBetween(lo, hi)
      expect(lo < mid).toBe(true)
      expect(mid < hi).toBe(true)
      hi = mid
    }
  })

  // 150 rather than 50: the run must cross the 62-key point where the integer part has to grow
  // (az -> b00), which 50 keys never reach.
  it('keeps lexicographic order consistent with insertion order for an appended run', () => {
    const keys: string[] = []
    let last: string | null = null
    for (let i = 0; i < 150; i++) {
      last = rankBetween(last, null)
      keys.push(last)
    }
    expect([...keys].sort()).toEqual(keys)
  })

  it('rejects a reversed pair rather than silently returning a broken key', () => {
    const a = rankBetween(null, null)
    const b = rankBetween(a, null)
    expect(() => rankBetween(b, a)).toThrow()
  })

  it('rejects equal neighbours', () => {
    const a = rankBetween(null, null)
    expect(() => rankBetween(a, a)).toThrow()
  })
})
