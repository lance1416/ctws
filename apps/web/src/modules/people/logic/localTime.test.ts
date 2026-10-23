import { describe, expect, it } from 'vitest'
import { theirTime } from './localTime'

// 10:24 in London on October 18, 2026, still summer time there.
const AT = new Date('2026-10-18T09:24:00Z')

describe('theirTime', () => {
  it('says the same when the clocks agree', () => {
    expect(theirTime(AT, 'Europe/London', 'Europe/London')).toBe('Same as yours')
    expect(theirTime(AT, 'Europe/Dublin', 'Europe/London')).toBe('Same as yours')
  })

  it('says their clock and how far ahead or behind, by both zones that day', () => {
    expect(theirTime(AT, 'Asia/Shanghai', 'Europe/London')).toBe('17:24, 7 hours ahead')
    expect(theirTime(AT, 'America/Toronto', 'Europe/London')).toBe('05:24, 5 hours behind')
    expect(theirTime(AT, 'Asia/Kolkata', 'Europe/London')).toBe('14:54, 4.5 hours ahead')
  })
})
