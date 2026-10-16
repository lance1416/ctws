import { describe, expect, it } from 'vitest'
import { occurrencesIn } from './occurrences'

/**
 * A hostile stored rule is not walked: it shows as the one meeting its start describes. Walking it
 * is what costs seconds (COUNT=5000000 took 3.2 s for a window far from the start, FREQ=SECONDLY
 * 5.5 s for a month), so a rule that was walked would put its occurrences in these windows.
 */
describe('a hostile rule costs what a real one costs', () => {
  const series = (rrule: string, startsLocal = '2026-01-01T09:00') => ({
    startsLocal,
    timeZone: 'America/Toronto',
    durationMinutes: 60,
    rrule,
  })
  const starts = (rrule: string, window: { from: Date; to: Date }) =>
    occurrencesIn(series(rrule), [], window).map((o) => o.startsLocal)
  const aroundStart = { from: new Date('2026-01-01T00:00Z'), to: new Date('2026-01-04T00:00Z') }

  it('refuses to walk COUNT=5000000', () => {
    // Walked, the daily rule would still be running in the year 9000.
    const far = { from: new Date('9000-10-01T00:00Z'), to: new Date('9000-11-15T00:00Z') }
    expect(starts('FREQ=DAILY;COUNT=5000000', far)).toEqual([])
    expect(starts('FREQ=DAILY;COUNT=5000000', aroundStart)).toEqual(['2026-01-01T09:00'])
  })

  it('refuses to walk FREQ=SECONDLY', () => {
    const month = { from: new Date('2026-10-01T00:00Z'), to: new Date('2026-11-15T00:00Z') }
    expect(starts('FREQ=SECONDLY', month)).toEqual([])
    expect(starts('FREQ=SECONDLY', aroundStart)).toEqual(['2026-01-01T09:00'])
  })
})
