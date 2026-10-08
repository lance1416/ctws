import { describe, expect, it } from 'vitest'
import { occurrencesIn } from '../src/meetings/occurrences'

/** The measured ceiling, as a test: a hostile rule must cost about what a real one costs. */
describe('a hostile rule costs what a real one costs', () => {
  const window = { from: new Date('2026-10-01T00:00Z'), to: new Date('2026-11-15T00:00Z') }
  const series = (rrule: string, startsLocal = '2026-01-01T09:00') => ({
    startsLocal,
    timeZone: 'America/Toronto',
    durationMinutes: 60,
    rrule,
  })

  it('refuses to spend seconds on COUNT=5000000', () => {
    // Measured unbounded: 3.2 seconds, and the collected-cap was never consulted -- the engine
    // walks every occurrence from the start before any of them reaches the window, and the cap
    // only counts the ones it collects. The window here is far from the start, which is what
    // makes the walk long.
    const started = Date.now()
    occurrencesIn(series('FREQ=DAILY;COUNT=5000000'), [], {
      from: new Date('9000-10-01T00:00Z'),
      to: new Date('9000-11-15T00:00Z'),
    })
    expect(Date.now() - started).toBeLessThan(300)
  })

  it('refuses to spend seconds on FREQ=SECONDLY', () => {
    const started = Date.now()
    occurrencesIn(series('FREQ=SECONDLY'), [], window)
    expect(Date.now() - started).toBeLessThan(300)
  })
})
