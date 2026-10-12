import { afterEach, describe, expect, it } from 'vitest'
import { setupWith, type TaskCtx } from './helpers/tasks'

/**
 * WHAT DAY IT IS IN THE OLD CALENDAR.
 *
 * A SHELL endpoint rather than a module's: "what is 2026-10-10 in the lunar calendar" is a property
 * of the day, not of contacts or of anything else. It is answered here rather than in the browser
 * because the library that knows is 750 KB.
 */

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

const setup = (): Promise<TaskCtx> => setupWith(cleanups)

describe('GET /calendar/days', () => {
  it('每一天一个农历标签，月初写月名', async () => {
    const ctx = await setup()
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/calendar/days?from=2026-10-10&to=2026-10-12',
      headers: ctx.authed,
    })
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json().days).toEqual({
      '2026-10-10': '九月初一',
      '2026-10-11': '初二',
      '2026-10-12': '初三',
    })
  })

  it('窗口有界，和别的日历查询同一条规矩', async () => {
    const ctx = await setup()
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/calendar/days?from=2026-01-01&to=2028-01-01',
      headers: ctx.authed,
    })
    expect(res.statusCode).toBe(400)
  })

  it('没登录就没有', async () => {
    const ctx = await setup()
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/calendar/days?from=2026-10-10&to=2026-10-10',
    })
    expect(res.statusCode).toBe(401)
  })
})
