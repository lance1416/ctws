import { describe, expect, it } from 'vitest'
import { cityAndZone } from './timeZones'

// The abbreviation belongs to the instant given: a January meeting read in July still says EST.
describe('cityAndZone', () => {
  const january = new Date('2026-01-20T14:00:00Z')
  const july = new Date('2026-07-20T13:00:00Z')

  it('says the abbreviation the zone is using at the instant it is given', () => {
    expect(cityAndZone(january, 'America/Toronto')).toBe('Toronto · EST')
    expect(cityAndZone(july, 'America/Toronto')).toBe('Toronto · EDT')
  })

  it('reads the city out of the IANA name, underscores and all', () => {
    expect(cityAndZone(january, 'America/New_York')).toBe('New York · EST')
  })

  it('says the offset where a zone has no abbreviation of its own', () => {
    // An offset is not a place, so the city is still said beside it.
    expect(cityAndZone(january, 'Asia/Shanghai')).toBe('Shanghai · GMT+8')
    expect(cityAndZone(january, 'Europe/London')).toBe('London · GMT')
    expect(cityAndZone(july, 'Europe/London')).toBe('London · GMT+1')
  })

  it('falls back to the city for a zone this platform does not know', () => {
    expect(cityAndZone(january, 'Mars/Olympus')).toBe('Olympus')
  })
})
