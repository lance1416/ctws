import { describe, expect, it } from 'vitest'
import { onServerClock, serverNow, setServerNow } from './serverClock'

describe('the server clock', () => {
  it('runs from the server’s present, and says when that moves', () => {
    let heard = 0
    const stop = onServerClock(() => heard++)
    const readAt = Date.parse('2026-10-21T12:00:00Z')
    setServerNow('2026-10-18T09:24:00Z', readAt)
    // As far behind the browser as the server was when it answered.
    const lag = Date.parse('2026-10-18T09:24:00Z') - readAt
    expect(Math.abs(serverNow().getTime() - (Date.now() + lag))).toBeLessThan(50)
    expect(heard).toBe(1)
    // The same present again, give or take the network: nothing to redraw.
    setServerNow('2026-10-18T09:24:00.300Z', readAt)
    expect(heard).toBe(1)
    stop()
    setServerNow(new Date().toISOString())
  })
})
