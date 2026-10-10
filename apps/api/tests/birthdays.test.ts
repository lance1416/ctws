import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { listBirthdays } from '../src/contacts/birthdays'
import { setupWith, type TaskCtx, web } from './helpers/tasks'

/**
 * THE BIRTHDAYS VIEW -- one page's worth of data, segmented and counted by the server.
 *
 * The segmenting lives on this side for the reason the design spec gives (section 8.4): two
 * clients would each segment it themselves, and two segmentings that disagree is one person
 * showing up twice.
 */

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

async function setup(timezone = 'Asia/Shanghai'): Promise<TaskCtx> {
  const ctx = await setupWith(cleanups)
  await ctx.db.execute(sql`update users set timezone = ${timezone}`)
  return ctx
}

async function workspaceOf(ctx: TaskCtx): Promise<string> {
  const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: ctx.authed })
  return (res.json() as { workspaceId: string }).workspaceId
}

async function add(ctx: TaskCtx, name: string, birthday?: unknown, circle?: string) {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/contacts',
    headers: web(ctx),
    payload: { name, ...(birthday ? { birthday } : {}), ...(circle ? { circle } : {}) },
  })
  expect(res.statusCode, res.body).toBe(201)
}

type Row = {
  name: string
  inDays: number
  turns: number | null
  lunarDate: string | null
  remindLead: number
}

async function view(ctx: TaskCtx) {
  const res = await ctx.app.inject({
    method: 'GET',
    url: '/api/v1/contacts/birthdays',
    headers: ctx.authed,
  })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as {
    today: string
    coming: Row[]
    later: Row[]
    byMonth: Record<string, number>
    circles: Record<string, number>
  }
}

/** The month and day `n` days from the view's own "today", so no test is pinned to a date. */
function monthDay(today: string, n: number): { month: number; day: number } {
  const d = new Date(`${today}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return { month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

describe('GET /contacts/birthdays', () => {
  it('七天内的进 coming，其余按倒数排进 later，没有生日的人不出现', async () => {
    const ctx = await setup()
    const today = (await view(ctx)).today
    const year = Number(today.slice(0, 4))
    await add(ctx, '今天的', { calendar: 'solar', year: 1993, ...monthDay(today, 0) }, 'friend')
    await add(ctx, '第七天的', { calendar: 'solar', year: 1988, ...monthDay(today, 7) }, 'work')
    await add(ctx, '第八天的', { calendar: 'solar', year: 1996, ...monthDay(today, 8) })
    await add(ctx, '没生日的人')

    const body = await view(ctx)
    expect(body.coming.map((r) => r.name)).toEqual(['今天的', '第七天的'])
    expect(body.later.map((r) => r.name)).toEqual(['第八天的'])
    expect(body.coming[0]).toMatchObject({ inDays: 0, turns: year - 1993 })
    expect(body.coming[1]?.inDays).toBe(7)
  })

  it('农历追的人带农历回显，公历追的人没有', async () => {
    const ctx = await setup()
    await add(ctx, '周楠', { calendar: 'lunar', year: 1991, month: 9, day: 3 })
    await add(ctx, '王颖', { calendar: 'solar', year: 1993, month: 10, day: 10 })
    const body = await view(ctx)
    const rows = [...body.coming, ...body.later]
    expect(rows.find((r) => r.name === '周楠')?.lunarDate).toBe('农历九月初三')
    expect(rows.find((r) => r.name === '王颖')?.lunarDate).toBeNull()
  })

  it('月份索引按下一次的公历月计数，circle 一并数出来', async () => {
    const ctx = await setup()
    await add(ctx, '王颖', { calendar: 'solar', year: 1993, month: 10, day: 10 }, 'friend')
    await add(ctx, 'Priya', { calendar: 'solar', year: 1988, month: 10, day: 15 }, 'work')
    await add(ctx, '李雷', { calendar: 'solar', year: 1996, month: 4, day: 15 }, 'friend')
    const body = await view(ctx)
    expect(body.byMonth['10']).toBe(2)
    expect(body.byMonth['4']).toBe(1)
    // 零不画成 0：没有人的月份根本不在这张表里（`Panel` 的 count 同一个规矩）。
    expect(body.byMonth['7']).toBeUndefined()
    expect(body.circles).toEqual({ friend: 2, work: 1 })
  })

  /** Review Focus 5：当天的生日在账户时区里一整天都是「今天」。 */
  it('「今天」是账户时区的今天，不是 UTC 的', async () => {
    // 2026-10-10T22:00Z：上海已是 10-11，洛杉矶还是 10-10。
    const clock = new Date('2026-10-10T22:00:00Z')
    const shanghai = await setup('Asia/Shanghai')
    await add(shanghai, '十一号生的', { calendar: 'solar', year: 1990, month: 10, day: 11 })
    const la = await setup('America/Los_Angeles')
    await add(la, '十一号生的', { calendar: 'solar', year: 1990, month: 10, day: 11 })

    const inShanghai = await listBirthdays(
      shanghai.db,
      await workspaceOf(shanghai),
      'Asia/Shanghai',
      clock,
    )
    const inLa = await listBirthdays(la.db, await workspaceOf(la), 'America/Los_Angeles', clock)
    expect(inShanghai.today).toBe('2026-10-11')
    expect(inShanghai.coming[0]?.inDays).toBe(0)
    expect(inLa.today).toBe('2026-10-10')
    expect(inLa.coming[0]?.inDays).toBe(1)
  })

  it('别人 workspace 的人不出现', async () => {
    const mine = await setup()
    await add(mine, '我的人', { calendar: 'solar', year: 1990, month: 10, day: 12 })
    const theirs = await setup()
    await add(theirs, '他们的人', { calendar: 'solar', year: 1990, month: 10, day: 12 })
    const body = await view(mine)
    expect([...body.coming, ...body.later].map((r) => r.name)).toEqual(['我的人'])
  })

  it('没登录就没有', async () => {
    const ctx = await setup()
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/contacts/birthdays' })
    expect(res.statusCode).toBe(401)
  })
})
