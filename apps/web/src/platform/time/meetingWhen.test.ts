import { describe, expect, it } from 'vitest'
import { meetingWhen } from './meetingWhen'

const NOW = new Date('2026-10-20T09:00:00.000Z')

describe('meetingWhen', () => {
  it('says the weekday and time within a week, on the reader’s clock', () => {
    // 14:00 in London on Thursday Oct 22.
    expect(meetingWhen('2026-10-22T13:00:00.000Z', 'Europe/London', NOW)).toBe('Thu 14:00')
    // 20:00 on Oct 18 in Toronto is already Oct 19 in UTC.
    expect(meetingWhen('2026-10-19T00:00:00.000Z', 'America/Toronto', NOW)).toBe('Sun 20:00')
  })

  it('says the day when it is further off, either way', () => {
    expect(meetingWhen('2026-09-30T13:00:00.000Z', 'Europe/London', NOW)).toBe('Sep 30')
    expect(meetingWhen('2026-11-30T13:00:00.000Z', 'Europe/London', NOW)).toBe('Nov 30')
  })
})
