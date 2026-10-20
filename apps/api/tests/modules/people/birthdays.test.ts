import type { CalendarEntry } from '@ctws/contracts'
import { keptNote, nextOccurrence, type Birthday } from '@ctws/core'
import { afterEach, describe, expect, it } from 'vitest'
import { setupWith, type Harness, web } from '../../helpers/harness'
import { createPerson } from '../../helpers/builders'

/**
 * THE BIRTHDAYS VIEW -- one page's worth of data, segmented and counted by the server.
 *
 * The segmenting lives on this side because two clients would each segment it themselves, and two
 * segmentings that disagree is one person showing up twice.
 */

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

/** Noon on 2026-10-13 in Shanghai: every "today" below is this day, whenever the suite runs. */
const NOW = new Date('2026-10-13T04:00:00Z')

const setup = (timezone = 'Asia/Shanghai'): Promise<Harness> =>
  setupWith(cleanups, undefined, { timezone, clock: () => NOW })

type Fields = NonNullable<Parameters<typeof createPerson>[1]>

const add = (
  ctx: Harness,
  name: string,
  birthday?: Fields['birthday'],
  circle?: Fields['circle'],
) => createPerson(ctx, { name, ...(birthday ? { birthday } : {}), ...(circle ? { circle } : {}) })

type Row = {
  name: string
  inDays: number
  turns: number | null
  lunarDate: string | null
}

async function view(ctx: Harness) {
  const res = await ctx.app.inject({
    method: 'GET',
    url: '/api/v1/people?view=birthdays',
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

/** The month and day `n` days after `today`. */
function monthDay(today: string, n: number): { month: number; day: number } {
  const d = new Date(`${today}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return { month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

describe('GET /people/birthdays', () => {
  it('puts the next seven days in coming, the rest in later by countdown, and leaves out people without a birthday', async () => {
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

  it('shows the lunar date only for a lunar birthday', async () => {
    const ctx = await setup()
    await add(ctx, '周楠', { calendar: 'lunar', year: 1991, month: 9, day: 3 })
    await add(ctx, '王颖', { calendar: 'solar', year: 1993, month: 10, day: 10 })
    const body = await view(ctx)
    const rows = [...body.coming, ...body.later]
    expect(rows.find((r) => r.name === '周楠')?.lunarDate).toBe('农历九月初三')
    expect(rows.find((r) => r.name === '王颖')?.lunarDate).toBeNull()
  })

  it('counts people by the solar month of their next birthday, and by circle', async () => {
    const ctx = await setup()
    await add(ctx, '王颖', { calendar: 'solar', year: 1993, month: 10, day: 10 }, 'friend')
    await add(ctx, 'Priya', { calendar: 'solar', year: 1988, month: 10, day: 15 }, 'work')
    await add(ctx, '李雷', { calendar: 'solar', year: 1996, month: 4, day: 15 }, 'friend')
    const body = await view(ctx)
    expect(body.byMonth['10']).toBe(2)
    expect(body.byMonth['4']).toBe(1)
    // A month with nobody is absent, not 0.
    expect(body.byMonth['7']).toBeUndefined()
    expect(body.circles).toEqual({ friend: 2, work: 1 })
  })

  /** A birthday is today for the whole of the account's day. */
  it('says which zone each row was counted in (BUG-010)', async () => {
    const ctx = await setupWith(cleanups)
    await createPerson(ctx, {
      name: 'Lena',
      city: 'Toronto, Ontario, Canada',
      birthday: { calendar: 'solar', month: 12, day: 25 },
    })
    await createPerson(ctx, { name: 'Nobody', birthday: { calendar: 'solar', month: 12, day: 26 } })
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/people?view=birthdays',
      headers: web(ctx),
    })
    const rows = [...res.json().coming, ...res.json().later] as { name: string; timeZone: string }[]
    expect(rows.find((r) => r.name === 'Lena')?.timeZone).toBe('America/Toronto')
    expect(rows.find((r) => r.name === 'Nobody')?.timeZone).toBe('UTC')
  })

  it("decides today in the account's zone, not UTC", async () => {
    // 2026-10-10T22:00Z is already 10-11 in Shanghai and still 10-10 in Los Angeles.
    const at = (timezone: string) =>
      setupWith(cleanups, undefined, { timezone, clock: () => new Date('2026-10-10T22:00:00Z') })
    const shanghai = await at('Asia/Shanghai')
    await add(shanghai, '十一号生的', { calendar: 'solar', year: 1990, month: 10, day: 11 })
    const la = await at('America/Los_Angeles')
    await add(la, '十一号生的', { calendar: 'solar', year: 1990, month: 10, day: 11 })

    const inShanghai = await view(shanghai)
    const inLa = await view(la)
    expect(inShanghai.today).toBe('2026-10-11')
    expect(inShanghai.coming[0]?.inDays).toBe(0)
    expect(inLa.today).toBe('2026-10-10')
    expect(inLa.coming[0]?.inDays).toBe(1)
  })

  it("leaves out another workspace's people", async () => {
    const mine = await setup()
    await add(mine, '我的人', { calendar: 'solar', year: 1990, month: 10, day: 12 })
    const theirs = await setup()
    await add(theirs, '他们的人', { calendar: 'solar', year: 1990, month: 10, day: 12 })
    const body = await view(mine)
    expect([...body.coming, ...body.later].map((r) => r.name)).toEqual(['我的人'])
  })

  it('requires a session', async () => {
    const ctx = await setup()
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/people?view=birthdays' })
    expect(res.statusCode).toBe(401)
  })
})

async function entries(ctx: Harness, from: string, to: string): Promise<CalendarEntry[]> {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/api/v1/people?view=calendar&from=${from}&to=${to}`,
    headers: ctx.authed,
  })
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as { entries: CalendarEntry[] }).entries
}

describe('GET /people/calendar', () => {
  it('gives one entry per birthday in the window, with name and age and no time', async () => {
    const ctx = await setup()
    await add(ctx, '王颖', { calendar: 'solar', year: 1993, month: 10, day: 10 })
    await add(ctx, '周楠', { calendar: 'lunar', year: 1991, month: 9, day: 3 })
    const rows = await entries(ctx, '2026-10-01', '2026-10-31')
    expect(rows).toHaveLength(2)
    const 王颖 = rows.find((r) => r.title === '王颖')
    expect(王颖).toMatchObject({
      day: '2026-10-10',
      title: '王颖',
      turns: 33,
      type: 'person',
      kind: 'birthday',
      startsAt: null,
      endsAt: null,
    })
    expect(王颖?.id).toMatch(/^[0-9a-f-]{36}$/)
    // A lunar birthday falls on its own day, not on the solar 10-10.
    expect(rows.find((r) => r.title === '周楠')?.day).toBe('2026-10-12')
  })

  it('leaves out birthdays outside the window, and has no age without a year', async () => {
    const ctx = await setup()
    await add(ctx, '李雷', { calendar: 'solar', year: 1996, month: 4, day: 15 })
    await add(ctx, '蒋老师', { calendar: 'solar', year: null, month: 10, day: 20 })
    const rows = await entries(ctx, '2026-10-01', '2026-10-31')
    expect(rows.map((r) => [r.title, r.turns])).toEqual([['蒋老师', null]])
  })

  it('gives each year its own entry, told apart by the day, in a window spanning a year', async () => {
    const ctx = await setup()
    await add(ctx, '王颖', { calendar: 'solar', year: 1993, month: 10, day: 10 })
    // 367 days: inside `MAX_CALENDAR_SPAN_DAYS` (370), and long enough to hold two 10-10s.
    const rows = await entries(ctx, '2026-10-09', '2027-10-11')
    expect(rows).toHaveLength(2)
    expect(new Set(rows.map((r) => r.id)).size).toBe(1)
    expect(rows.map((r) => r.day)).toEqual(['2026-10-10', '2027-10-10'])
  })
})

describe('GET /people/birthday-preview', () => {
  const preview = (ctx: Harness, query: string) =>
    ctx.app.inject({
      method: 'GET',
      url: `/api/v1/people/birthday-preview?${query}`,
      headers: ctx.authed,
    })

  it('answers the lunar date, zodiac, sign and next occurrence for a solar birthday', async () => {
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
   * Which fallback applies depends on the year today falls in (a leap 六月 year has none), so this
   * pins the route's job only: the library's answer for the account's today, passed through whole.
   * The branches themselves are pinned in core's birthday tests on a fixed today.
   */
  it('passes the fallback for a leap-month birthday through', async () => {
    const ctx = await setup()
    const today = (await view(ctx)).today
    const born: Birthday = { calendar: 'lunar', year: 2017, month: 6, day: 15, leapMonth: true }
    const res = await preview(ctx, 'calendar=lunar&year=2017&month=6&day=15&leap=true')
    expect(res.statusCode, res.body).toBe(200)
    const body = res.json()
    expect(body.lunarDate).toBe('农历闰六月十五')
    const next = nextOccurrence(born, today)
    expect(body.next.day).toBe(next.day)
    expect(body.next.keptNote).toBe(keptNote(born, next))
  })

  it('gives no sign for a lunar birthday without a year', async () => {
    const ctx = await setup()
    const res = await preview(ctx, 'calendar=lunar&month=9&day=3')
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json().sign).toBeNull()
    expect(res.json().zodiac).toBeNull()
    expect(res.json().lunarDate).toBe('农历九月初三')
  })

  it('refuses a solar day that does not exist with 400', async () => {
    const ctx = await setup()
    const res = await preview(ctx, 'calendar=solar&year=1996&month=2&day=30')
    expect(res.statusCode).toBe(400)
    expect(res.json().detail).toContain('does not exist')
  })

  it('requires a session', async () => {
    const ctx = await setup()
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/people/birthday-preview?calendar=solar&month=4&day=15',
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('a moved birthday', () => {
  /**
   * The note is the library's; this pins that it reaches the wire unchanged. Its wording is pinned
   * in core's birthday tests on a fixed today.
   */
  it('explains a fallback in a sentence, and is null when nothing moved', async () => {
    const ctx = await setup()
    const today = (await view(ctx)).today
    const born: Birthday = { calendar: 'lunar', year: 2017, month: 6, day: 15, leapMonth: true }
    const moved = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/people/birthday-preview?calendar=lunar&year=2017&month=6&day=15&leap=true',
      headers: ctx.authed,
    })
    expect(moved.statusCode, moved.body).toBe(200)
    expect(moved.json().next.keptNote).toBe(keptNote(born, nextOccurrence(born, today)))

    // April 15 exists every year, so this half is null in any year.
    const still = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/people/birthday-preview?calendar=solar&year=1996&month=4&day=15',
      headers: ctx.authed,
    })
    expect(still.json().next.keptNote).toBeNull()
  })
})

describe('the workbench card', () => {
  it('shows each person by their own lead', async () => {
    const ctx = await setup()
    const today = (await view(ctx)).today
    // Five days out: a one-week lead shows, a same-day lead does not.
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

  it('defaults to a week', async () => {
    const ctx = await setup()
    const today = (await view(ctx)).today
    await add(ctx, '第七天的', { calendar: 'solar', year: 1990, ...monthDay(today, 7) })
    await add(ctx, '第八天的', { calendar: 'solar', year: 1990, ...monthDay(today, 8) })
    expect((await view(ctx)).card.map((r) => r.name)).toEqual(['第七天的'])
  })
})

/**
 * Each field can be valid while the date never happened, depending on the year, which only the
 * calendar library knows. Stored, it would break every read that derives from it.
 */
describe('a lunar day that never happened', () => {
  const post = (ctx: Harness, birthday: unknown) =>
    ctx.app.inject({
      method: 'POST',
      url: '/api/v1/people',
      headers: web(ctx),
      payload: { name: '张三', birthday },
    })

  const preview = (ctx: Harness, query: string) =>
    ctx.app.inject({
      method: 'GET',
      url: `/api/v1/people/birthday-preview?${query}`,
      headers: ctx.authed,
    })

  it('refuses the 30th of a 29-day month on create, saying why', async () => {
    const ctx = await setup()
    const res = await post(ctx, { calendar: 'lunar', year: 2021, month: 1, day: 30 })
    expect(res.statusCode, res.body).toBe(422)
    expect(res.json().detail).toBe('正月 has 29 days in 2021, so there is no 三十.')
  })

  it('refuses a leap month that year does not have on create', async () => {
    const ctx = await setup()
    const res = await post(ctx, {
      calendar: 'lunar',
      year: 2018,
      month: 6,
      day: 15,
      leapMonth: true,
    })
    expect(res.statusCode, res.body).toBe(422)
    expect(res.json().detail).toBe('There was no 闰六月 in 2018.')
  })

  it('refuses February 29 in a common year on create', async () => {
    const ctx = await setup()
    const res = await post(ctx, { calendar: 'solar', year: 2001, month: 2, day: 29 })
    expect(res.statusCode, res.body).toBe(422)
    expect(res.json().detail).toBe('February has 28 days in 2001, so there is no 29th.')
  })

  it('refuses the same on update', async () => {
    const ctx = await setup()
    const created = await post(ctx, { calendar: 'lunar', year: 1996, month: 2, day: 28 })
    expect(created.statusCode, created.body).toBe(201)
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/people/${created.json().id}`,
      headers: web(ctx),
      payload: { birthday: { calendar: 'lunar', year: 2021, month: 1, day: 30 } },
    })
    expect(res.statusCode, res.body).toBe(422)
    expect(res.json().detail).toBe('正月 has 29 days in 2021, so there is no 三十.')
  })

  it('refuses it in the preview too, before anything is saved', async () => {
    const ctx = await setup()
    const res = await preview(ctx, 'calendar=lunar&year=2021&month=1&day=30')
    expect(res.statusCode, res.body).toBe(422)
    expect(res.json().detail).toBe('正月 has 29 days in 2021, so there is no 三十.')
  })

  it('accepts a lunar 30th without a year, which cannot be checked', async () => {
    const ctx = await setup()
    const res = await preview(ctx, 'calendar=lunar&month=1&day=30')
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json().lunarDate).toBe('农历正月三十')
  })
})
