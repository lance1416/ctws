import { describe, expect, it } from 'vitest'
import { zoneLabel } from './timeZones'

// The abbreviation belongs to the instant given: a January meeting read in July still says EST.
describe('zoneLabel', () => {
  const january = new Date('2026-01-20T14:00:00Z')
  const july = new Date('2026-07-20T13:00:00Z')

  it('says the abbreviation the zone is using at the instant it is given', () => {
    expect(zoneLabel('America/Toronto', january)).toBe('Toronto · EST')
    expect(zoneLabel('America/Toronto', july)).toBe('Toronto · EDT')
  })

  it('reads the city out of the IANA name, underscores and all', () => {
    expect(zoneLabel('America/New_York', january)).toBe('New York · EST')
  })

  it('says the offset where a zone has no abbreviation of its own', () => {
    // An offset is not a place, so the city is still said beside it.
    expect(zoneLabel('Asia/Shanghai', january)).toBe('Shanghai · GMT+8')
    expect(zoneLabel('Europe/London', january)).toBe('London · GMT')
    expect(zoneLabel('Europe/London', july)).toBe('London · GMT+1')
  })

  it('falls back to the city for a zone this platform does not know', () => {
    expect(zoneLabel('Mars/Olympus', january)).toBe('Olympus')
  })
})
