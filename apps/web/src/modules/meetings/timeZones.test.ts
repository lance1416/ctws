import { describe, expect, it } from 'vitest'
import { zoneLabel } from './timeZones'

/**
 * A ZONE'S ABBREVIATION BELONGS TO AN INSTANT, never to the moment the page happens to be open.
 *
 * "09:00 EST" and "09:00 EDT" are an hour apart in reality, so a meeting in January read in July
 * must still say EST. That is why the instant is a required argument and not a defaulted one: a
 * call site that cannot name an instant is a call site that does not know which abbreviation it
 * means, and the compiler says so rather than the screen being quietly wrong half the year.
 */
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
    // GMT+8 IS the whole answer, so the city is still worth saying beside it.
    expect(zoneLabel('Asia/Shanghai', january)).toBe('Shanghai · GMT+8')
    // ...and London in winter reports exactly its city's own word, which would read as
    // "London · London" if the two were not compared.
    expect(zoneLabel('Europe/London', january)).toBe('London · GMT')
    expect(zoneLabel('Europe/London', july)).toBe('London · GMT+1')
  })

  it('falls back to the city for a zone this platform does not know', () => {
    expect(zoneLabel('Mars/Olympus', january)).toBe('Olympus')
  })
})
