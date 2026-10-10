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
    card: Row[]
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

type Entry = {
  id: string
  day: string
  title: string
  to: string
  kind: string
  time: string | null
}

async function entries(ctx: TaskCtx, from: string, to: string): Promise<Entry[]> {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/api/v1/contacts/calendar?from=${from}&to=${to}`,
    headers: ctx.authed,
  })
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as { entries: Entry[] }).entries
}

describe('GET /contacts/calendar', () => {
  it('窗口里的生日各一条，带名字与年龄，没有时刻', async () => {
    const ctx = await setup()
    await add(ctx, '王颖', { calendar: 'solar', year: 1993, month: 10, day: 10 })
    await add(ctx, '周楠', { calendar: 'lunar', year: 1991, month: 9, day: 3 })
    const rows = await entries(ctx, '2026-10-01', '2026-10-31')
    expect(rows).toHaveLength(2)
    const 王颖 = rows.find((r) => r.title.startsWith('王颖'))
    expect(王颖).toMatchObject({
      day: '2026-10-10',
      title: '王颖 33',
      kind: 'Birthday',
      time: null,
    })
    expect(王颖?.to).toMatch(/^\/contacts\/[0-9a-f-]{36}$/)
    // 农历追的人落在他自己的那天，不是公历的 10-10。
    expect(rows.find((r) => r.title.startsWith('周楠'))?.day).toBe('2026-10-12')
  })

  it('窗口外的人不出现，没有年份的人只有名字', async () => {
    const ctx = await setup()
    await add(ctx, '李雷', { calendar: 'solar', year: 1996, month: 4, day: 15 })
    await add(ctx, '蒋老师', { calendar: 'solar', year: null, month: 10, day: 20 })
    const rows = await entries(ctx, '2026-10-01', '2026-10-31')
    expect(rows.map((r) => r.title)).toEqual(['蒋老师'])
  })

  it('条目 id 带日期，所以跨年的窗口里同一个人不会撞 id', async () => {
    const ctx = await setup()
    await add(ctx, '王颖', { calendar: 'solar', year: 1993, month: 10, day: 10 })
    // 367 天：在 `MAX_CALENDAR_SPAN_DAYS`（370）之内，而两次 10-10 之间隔着 365 天，所以窗口
    // 必须跨过那一整年才装得下两次。
    const rows = await entries(ctx, '2026-10-09', '2027-10-11')
    expect(rows).toHaveLength(2)
    expect(new Set(rows.map((r) => r.id)).size).toBe(2)
    expect(rows.map((r) => r.day)).toEqual(['2026-10-10', '2027-10-10'])
  })
})

describe('GET /contacts/birthdays/preview', () => {
  const preview = (ctx: TaskCtx, query: string) =>
    ctx.app.inject({
      method: 'GET',
      url: `/api/v1/contacts/birthdays/preview?${query}`,
      headers: ctx.authed,
    })

  it('公历输入回答农历、生肖、星座与下一次', async () => {
    const ctx = await setup()
    const res = await preview(ctx, 'calendar=solar&year=1996&month=4&day=15&hour=6')
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json()).toMatchObject({
      bornLunar: '农历丙子年二月廿八',
      zodiac: '鼠',
      sign: '白羊',
      hour: '午时 · 11–13',
    })
  })

  /**
   * 下一次从「今天」算，所以这条的 `kept` 取决于日历：闰六月的年份很稀（2017、2025、2036），
   * 而下一次总在一年之内，所以从 2026 到 2036 这条都成立。
   */
  it('闰月输入把回退说出来', async () => {
    const ctx = await setup()
    const res = await preview(ctx, 'calendar=lunar&year=2017&month=6&day=15&leap=true')
    expect(res.statusCode, res.body).toBe(200)
    const body = res.json()
    expect(body.lunarDate).toBe('农历闰六月十五')
    expect(body.next.kept).toContain('leap-month')
  })

  it('没有年份的农历输入没有星座', async () => {
    const ctx = await setup()
    const res = await preview(ctx, 'calendar=lunar&month=9&day=3')
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json().sign).toBeNull()
    expect(res.json().zodiac).toBeNull()
    expect(res.json().lunarDate).toBe('农历九月初三')
  })

  it('公历里不存在的日子是 400', async () => {
    const ctx = await setup()
    const res = await preview(ctx, 'calendar=solar&year=1996&month=2&day=30')
    expect(res.statusCode).toBe(400)
    expect(res.json().detail).toContain('does not exist')
  })

  it('没登录就没有', async () => {
    const ctx = await setup()
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/contacts/birthdays/preview?calendar=solar&month=4&day=15',
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('被挪动的日子', () => {
  it('回退带着一句写给人看的话，没挪过就是 null', async () => {
    const ctx = await setup()
    const moved = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/contacts/birthdays/preview?calendar=lunar&year=2017&month=6&day=15&leap=true',
      headers: ctx.authed,
    })
    expect(moved.statusCode, moved.body).toBe(200)
    // 具体那句话在 `@ctws/core` 的单测里按固定的「今天」钉住；这里钉的是它确实走到了线上。
    expect(moved.json().next.keptNote).toMatch(/^No 闰六月 in \d{4}, so it is kept on 六月十五\.$/)

    const still = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/contacts/birthdays/preview?calendar=solar&year=1996&month=4&day=15',
      headers: ctx.authed,
    })
    expect(still.json().next.keptNote).toBeNull()
  })
})

describe('工作台卡片', () => {
  it('按每个人自己的提前量决定谁出现', async () => {
    const ctx = await setup()
    const today = (await view(ctx)).today
    // 提前一周的人，第 5 天就该出现；只要当天的人，第 5 天不该出现。
    await add(ctx, '要一周的', {
      calendar: 'solar',
      year: 1990,
      ...monthDay(today, 5),
      remindLead: 7,
    })
    await add(ctx, '只要当天的', {
      calendar: 'solar',
      year: 1990,
      ...monthDay(today, 5),
      remindLead: 0,
    })
    await add(ctx, '今天的', {
      calendar: 'solar',
      year: 1990,
      ...monthDay(today, 0),
      remindLead: 0,
    })

    const body = await view(ctx)
    expect(body.card.map((r) => r.name)).toEqual(['今天的', '要一周的'])
  })

  it('默认是一周', async () => {
    const ctx = await setup()
    await add(ctx, '没说的', { calendar: 'solar', year: 1990, month: 10, day: 10 })
    const body = await view(ctx)
    expect([...body.coming, ...body.later][0]?.remindLead).toBe(7)
  })
})

/**
 * 一个没发生过的日子。
 *
 * 每个字段自己都合法 -- 农历有三十，有的年份闰六月 -- 凑起来可以不存在，而那取决于年份，所以
 * contract 看不见它（历法库 750 KB，不进浏览器）。门必须在写入之前关上：写进去的话，派生值要在
 * 读取时才算，联系人列表、搜索、生日页会一起 500，而且 app 里没有改它的地方。
 */
describe('农历里没发生过的日子进不来', () => {
  const post = (ctx: TaskCtx, birthday: unknown) =>
    ctx.app.inject({
      method: 'POST',
      url: '/api/v1/contacts',
      headers: web(ctx),
      payload: { name: '张三', birthday },
    })

  const preview = (ctx: TaskCtx, query: string) =>
    ctx.app.inject({
      method: 'GET',
      url: `/api/v1/contacts/birthdays/preview?${query}`,
      headers: ctx.authed,
    })

  it('那一年的正月没有三十，新建是 400 并说出理由', async () => {
    const ctx = await setup()
    const res = await post(ctx, { calendar: 'lunar', year: 2021, month: 1, day: 30 })
    expect(res.statusCode, res.body).toBe(400)
    expect(res.json().detail).toBe('正月 has 29 days in 2021, so there is no 三十.')
  })

  it('那一年不闰六月，新建是 400', async () => {
    const ctx = await setup()
    const res = await post(ctx, {
      calendar: 'lunar',
      year: 2018,
      month: 6,
      day: 15,
      leapMonth: true,
    })
    expect(res.statusCode, res.body).toBe(400)
    expect(res.json().detail).toBe('There was no 闰六月 in 2018.')
  })

  it('平年没有 2 月 29 日，新建是 400', async () => {
    const ctx = await setup()
    const res = await post(ctx, { calendar: 'solar', year: 2001, month: 2, day: 29 })
    expect(res.statusCode, res.body).toBe(400)
    expect(res.json().detail).toBe('February has 28 days in 2001, so there is no 29th.')
  })

  it('改也进不来', async () => {
    const ctx = await setup()
    const created = await post(ctx, { calendar: 'lunar', year: 1996, month: 2, day: 28 })
    expect(created.statusCode, created.body).toBe(201)
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/contacts/${created.json().id}`,
      headers: web(ctx),
      payload: { birthday: { calendar: 'lunar', year: 2021, month: 1, day: 30 } },
    })
    expect(res.statusCode, res.body).toBe(400)
    expect(res.json().detail).toBe('正月 has 29 days in 2021, so there is no 三十.')
  })

  it('preview 先说，所以人在按保存之前就看见了', async () => {
    const ctx = await setup()
    const res = await preview(ctx, 'calendar=lunar&year=2021&month=1&day=30')
    expect(res.statusCode, res.body).toBe(400)
    expect(res.json().detail).toBe('正月 has 29 days in 2021, so there is no 三十.')
  })

  it('没有年份就无从不存在：正月三十作为复发日是对的', async () => {
    const ctx = await setup()
    const res = await preview(ctx, 'calendar=lunar&month=1&day=30')
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json().lunarDate).toBe('农历正月三十')
  })
})
