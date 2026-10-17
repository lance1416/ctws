import { afterEach, describe, expect, it } from 'vitest'
import { setupWith, type Harness } from '../helpers/harness'

/**
 * WHAT DAY IT IS IN THE OLD CALENDAR.
 *
 * A SHELL endpoint rather than a module's: "what is 2026-10-10 in the lunar calendar" is a property
 * of the day, not of people or of anything else. It is answered here rather than in the browser
 * because the library that knows is 750 KB.
 */

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

const setup = (): Promise<Harness> => setupWith(cleanups)

describe('GET /calendar/days', () => {
  it('labels every day in the lunar calendar, naming the month on its first day', async () => {
    const ctx = await setup()
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/calendar/days?from=2026-10-10&to=2026-10-12',
      headers: ctx.authed,
    })
    expect(res.statusCode, res.body).toBe(200)
    // A day's name never changes, so the browser may keep it.
    expect(res.headers['cache-control']).toBe('private, max-age=86400')
    expect(res.json().days).toEqual({
      '2026-10-10': '九月初一',
      '2026-10-11': '初二',
      '2026-10-12': '初三',
    })
  })

  it('bounds the window by the same rule as the other calendar reads', async () => {
    const ctx = await setup()
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/calendar/days?from=2026-01-01&to=2028-01-01',
      headers: ctx.authed,
    })
    expect(res.statusCode).toBe(400)
  })

  it('requires a session', async () => {
    const ctx = await setup()
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/calendar/days?from=2026-10-10&to=2026-10-10',
    })
    expect(res.statusCode).toBe(401)
  })
})
