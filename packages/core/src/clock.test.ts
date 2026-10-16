import { describe, expect, it } from 'vitest'
import { clockTime, zoneAbbreviation } from './clock'

describe('clockTime', () => {
  it('is 24-hour from 00:00 to 23:59 in the given zone', () => {
    expect(clockTime(new Date('2026-10-13T00:00:00Z'), 'UTC')).toBe('00:00')
    expect(clockTime(new Date('2026-10-13T23:59:00Z'), 'UTC')).toBe('23:59')
    expect(clockTime(new Date('2026-10-13T13:05:00Z'), 'Asia/Shanghai')).toBe('21:05')
  })
})

describe('zoneAbbreviation', () => {
  it('names the zone as it is at that moment', () => {
    expect(zoneAbbreviation(new Date('2026-01-15T12:00:00Z'), 'America/Toronto')).toBe('EST')
    expect(zoneAbbreviation(new Date('2026-07-15T12:00:00Z'), 'America/Toronto')).toBe('EDT')
  })
})
