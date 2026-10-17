import { describe, expect, it } from 'vitest'
import { describeMeeting } from './listedMeeting'

const meeting = (startsAt: string) =>
  ({ type: 'meeting', id: 'm1', title: '二面', startsAt, timeZone: 'America/Toronto' }) as const

describe('describeMeeting', () => {
  it("says the series' start on its own clock, whatever day that is in UTC", () => {
    // 20:00 on Oct 6 in Toronto is already Oct 7 in UTC.
    expect(describeMeeting(meeting('2026-10-07T00:00:00.000Z'))).toBe('Oct 6, 20:00 · EDT')
  })

  it("names the zone by its season's name", () => {
    expect(describeMeeting(meeting('2026-12-01T14:00:00.000Z'))).toBe('Dec 1, 09:00 · EST')
  })
})
