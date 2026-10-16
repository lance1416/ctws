import { describe, expect, it } from 'vitest'
import { clockTime, windowOf } from '../../../src/modules/meetings/zone'

describe('clockTime', () => {
  it('is 24-hour from 00:00 to 23:59 in the given zone', () => {
    expect(clockTime(new Date('2026-10-13T00:00:00Z'), 'UTC')).toBe('00:00')
    expect(clockTime(new Date('2026-10-13T23:59:00Z'), 'UTC')).toBe('23:59')
    expect(clockTime(new Date('2026-10-13T13:05:00Z'), 'Asia/Shanghai')).toBe('21:05')
  })
})

describe('windowOf', () => {
  it('runs to the end of a 25-hour day', () => {
    // Toronto falls back on 2026-11-01: that day ends at 05:00Z, not 24 hours after 04:00Z.
    expect(windowOf('2026-11-01', '2026-11-01', 'America/Toronto')).toEqual({
      from: new Date('2026-11-01T04:00:00Z'),
      to: new Date('2026-11-02T05:00:00Z'),
    })
  })

  it('stops at the end of a 23-hour day', () => {
    expect(windowOf('2026-03-08', '2026-03-08', 'America/Toronto')).toEqual({
      from: new Date('2026-03-08T05:00:00Z'),
      to: new Date('2026-03-09T04:00:00Z'),
    })
  })
})
