import type { PersonResponse } from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { createProject, setupWith, type Harness, web } from '../../helpers/harness'

/**
 * PEOPLE -- THE THIRD MODULE, on vCard 4.0's model (RFC 6350).
 *
 * The claim that matters is the one a hand-rolled person model always gets wrong: a person has
 * SEVERAL ways to be reached, not one. Everything else here is the usual tenant and lifecycle
 * work, plus the one thing a replace-the-set write can break -- leaving the old rows behind.
 */

const cleanups: (() => Promise<void>)[] = []

const setup = () => setupWith(cleanups)
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

async function add(ctx: Harness, payload: Record<string, unknown>): Promise<PersonResponse> {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/people',
    headers: web(ctx),
    payload,
  })
  if (res.statusCode !== 201) throw new Error(`add: ${res.statusCode} ${res.body}`)
  return res.json() as PersonResponse
}

const patch = (ctx: Harness, id: string, payload: Record<string, unknown>) =>
  ctx.app.inject({ method: 'PATCH', url: `/api/v1/people/${id}`, headers: web(ctx), payload })

async function list(ctx: Harness, query = ''): Promise<PersonResponse[]> {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/api/v1/people${query}`,
    headers: ctx.authed,
  })
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as { people: PersonResponse[] }).people
}

describe('people', () => {
  it('keeps several ways to reach one person, in the order they were given', async () => {
    // THE WHOLE REASON TO FOLLOW vCARD. A single `email` column is wrong the first time somebody
    // has a work address and a personal one.
    const ctx = await setup()
    const person = await add(ctx, {
      name: '李雷',
      org: 'Acme',
      channels: [
        { kind: 'email', value: 'lilei@acme.test', label: '工作' },
        { kind: 'email', value: 'lilei@personal.test' },
        { kind: 'phone', value: '+86 138 0000 0000', label: '手机' },
        { kind: 'url', value: 'https://github.com/lilei' },
      ],
    })
    expect(person.channels.map((c) => c.value)).toEqual([
      'lilei@acme.test',
      'lilei@personal.test',
      '+86 138 0000 0000',
      'https://github.com/lilei',
    ])
    expect(person.channels[0]).toMatchObject({ kind: 'email', label: '工作' })
    // A label is optional, and its absence is null rather than a missing key.
    expect(person.channels[1]!.label).toBeNull()
  })

  it('replaces the whole channel set, leaving none of the old ones behind', async () => {
    // The failure mode of a replace-the-set write is orphans: the removed address goes on being
    // returned, and nobody can tell why the person has an address they deleted.
    const ctx = await setup()
    const person = await add(ctx, {
      name: '韩梅梅',
      channels: [
        { kind: 'email', value: 'old@acme.test' },
        { kind: 'phone', value: '+8613800000000' },
      ],
    })
    const res = await patch(ctx, person.id, {
      channels: [{ kind: 'email', value: 'new@acme.test' }],
    })
    expect(res.statusCode).toBe(200)
    expect((res.json() as PersonResponse).channels).toEqual([
      { kind: 'email', value: 'new@acme.test', label: null },
    ])

    // And an empty set really empties it.
    const emptied = await patch(ctx, person.id, { channels: [] })
    expect((emptied.json() as PersonResponse).channels).toEqual([])
  })

  it('counts a channel-only edit as a change to the person', async () => {
    // Without touching the row, `updated_at` would say nothing changed when their phone number
    // just did.
    const ctx = await setup()
    const person = await add(ctx, { name: '张三' })
    const after = await patch(ctx, person.id, {
      channels: [{ kind: 'phone', value: '+8613800000000' }],
    })
    expect(new Date((after.json() as PersonResponse).updatedAt).getTime()).toBeGreaterThan(
      new Date(person.updatedAt).getTime(),
    )
  })

  it('refuses a kind that is not one of the three, and an empty address', async () => {
    const ctx = await setup()
    const bad = (channels: unknown) =>
      ctx.app.inject({
        method: 'POST',
        url: '/api/v1/people',
        headers: web(ctx),
        payload: { name: '某人', channels },
      })
    expect((await bad([{ kind: 'fax', value: '1' }])).statusCode).toBe(400)
    expect((await bad([{ kind: 'email', value: '   ' }])).statusCode).toBe(400)
  })

  it('lists by name, because a person list is read to FIND someone', async () => {
    const ctx = await setup()
    await add(ctx, { name: 'Zoe' })
    await add(ctx, { name: 'Adam' })
    await add(ctx, { name: 'Mina' })
    expect((await list(ctx)).map((c) => c.name)).toEqual(['Adam', 'Mina', 'Zoe'])
  })

  it('puts one person on SEVERAL lines of work', async () => {
    // A maintainer on two of your repos, a recruiter holding two roles open. The single column
    // this replaced could only ever be half an answer.
    const ctx = await setup()
    const hunt = await createProject(ctx, '找工作')
    const rrgen = await createProject(ctx, 'rrgen')
    const person = await add(ctx, { name: '某维护者', projectIds: [hunt, rrgen] })
    await add(ctx, { name: '老朋友' })

    expect(person.projects.map((p) => p.name).sort()).toEqual(['rrgen', '找工作'])
    // And they turn up standing on EITHER line.
    expect((await list(ctx, `?projectId=${hunt}`)).map((c) => c.name)).toEqual(['某维护者'])
    expect((await list(ctx, `?projectId=${rrgen}`)).map((c) => c.name)).toEqual(['某维护者'])
    expect((await list(ctx, '?unfiled=true')).map((c) => c.name)).toEqual(['老朋友'])
  })

  it('replaces the whole set of projects, leaving none of the old links behind', async () => {
    const ctx = await setup()
    const a = await createProject(ctx, 'A')
    const b = await createProject(ctx, 'B')
    const person = await add(ctx, { name: '换了线的人', projectIds: [a] })
    const res = await patch(ctx, person.id, { projectIds: [b] })
    expect(res.statusCode).toBe(200)
    expect((res.json() as PersonResponse).projects.map((p) => p.name)).toEqual(['B'])
    expect(await list(ctx, `?projectId=${a}`)).toEqual([])

    // And an empty set really takes them off every line.
    expect((await patch(ctx, person.id, { projectIds: [] })).statusCode).toBe(200)
    expect((await list(ctx, '?unfiled=true')).map((c) => c.name)).toEqual(['换了线的人'])
  })

  it('keeps a person when their project is deleted', async () => {
    const ctx = await setup()
    const pid = await createProject(ctx, '没了的项目')
    const person = await add(ctx, { name: '留下来的人', projectIds: [pid] })
    await ctx.app.inject({ method: 'DELETE', url: `/api/v1/projects/${pid}`, headers: web(ctx) })

    const kept = (await list(ctx)).find((c) => c.id === person.id)
    // The link outlives the soft-deleted project, so the row must leave it out: a project nobody
    // can navigate to is worse than none.
    expect(kept).toMatchObject({ name: '留下来的人', projects: [] })
    // And they are findable again, as somebody who belongs to no project.
    expect((await list(ctx, '?unfiled=true')).map((c) => c.name)).toEqual(['留下来的人'])
  })

  it('finds a person by their address, not only by their name', async () => {
    // "who was the one at @acme.test" is exactly the question a person list answers.
    const ctx = await setup()
    await add(ctx, {
      name: '李雷',
      org: 'Acme',
      channels: [{ kind: 'email', value: 'lilei@acme.test' }],
    })
    await add(ctx, { name: '别人' })

    const hits = async (q: string) => {
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/v1/people/search?q=${encodeURIComponent(q)}`,
        headers: ctx.authed,
      })
      expect(res.statusCode).toBe(200)
      return (res.json() as { people: PersonResponse[] }).people.map((c) => c.name)
    }
    expect(await hits('acme.test')).toEqual(['李雷'])
    expect(await hits('Acme')).toEqual(['李雷'])
    expect(await hits('李雷')).toEqual(['李雷'])
    // A wildcard typed by a person is a character, not a pattern.
    expect(await hits('%')).toEqual([])
  })

  it('hides a deleted person from every read, and refuses to delete them twice', async () => {
    const ctx = await setup()
    const person = await add(ctx, { name: '删掉的' })
    const del = () =>
      ctx.app.inject({ method: 'DELETE', url: `/api/v1/people/${person.id}`, headers: web(ctx) })
    expect((await del()).statusCode).toBe(204)
    expect((await del()).statusCode).toBe(404)
    expect(await list(ctx)).toEqual([])
  })

  it('keeps one workspace out of another, as a not-found', async () => {
    const ctx = await setup()
    const mine = await add(ctx, { name: '我的联系人' })

    const other = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'x-ctws-client': 'web' },
      payload: { email: 'other@example.com', password: 'correct horse battery', timezone: 'UTC' },
    })
    const theirs: Harness = {
      ...ctx,
      authed: {
        'x-ctws-client': 'web',
        cookie: String(other.headers['set-cookie']).split(';')[0]!,
      },
    }

    expect(await list(theirs)).toEqual([])
    expect((await patch(theirs, mine.id, { name: '改名' })).statusCode).toBe(404)
    // And the refused patch wrote nothing.
    expect((await list(ctx)).map((c) => c.name)).toEqual(['我的联系人'])
  })

  it('refuses a project from another workspace, and writes no half a person', async () => {
    const ctx = await setup()
    const other = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'x-ctws-client': 'web' },
      payload: { email: 'two@example.com', password: 'correct horse battery', timezone: 'UTC' },
    })
    const theirs: Harness = {
      ...ctx,
      authed: {
        'x-ctws-client': 'web',
        cookie: String(other.headers['set-cookie']).split(';')[0]!,
      },
    }
    const theirProject = await createProject(theirs, '别人的项目')
    const mine = await createProject(ctx, '我的项目')

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/people',
      headers: web(ctx),
      payload: {
        name: '某人',
        // One of mine and one of theirs: the request must be refused WHOLE, not filed under the
        // half that happened to be visible.
        projectIds: [mine, theirProject],
        channels: [{ kind: 'email', value: 'a@b.test' }],
      },
    })
    expect(res.statusCode).toBe(404)
    expect(await list(ctx)).toEqual([])
  })
})

/**
 * A PERSON'S BIRTHDAY -- one date, given in one calendar, read in both.
 *
 * Every derived value here (the other calendar, the zodiac, the sign, the age, the next
 * occurrence) is computed on the way out and never stored, so these tests are also what pins
 * `@ctws/core`'s arithmetic to the wire.
 */
describe("a person's birthday", () => {
  it('reads a solar birthday back with everything derived from it', async () => {
    const ctx = await setup()
    const person = await add(ctx, {
      name: '李雷',
      birthday: { calendar: 'solar', year: 1996, month: 4, day: 15, hourBranch: 6 },
    })
    expect(person.birthday).toMatchObject({
      calendar: 'solar',
      year: 1996,
      month: 4,
      day: 15,
      leapMonth: false,
      hourBranch: 6,
      remindLead: 7,
      lunarDate: null,
      bornSolar: '1996-04-15',
      bornLunar: '农历丙子年二月廿八',
      zodiac: '鼠',
      sign: '白羊',
      hour: '午时 · 11–13',
    })
    expect(person.birthday?.next.day).toMatch(/^\d{4}-04-15$/)
  })

  it('keeps the leap month of a lunar birthday and gives its next occurrence', async () => {
    const ctx = await setup()
    const person = await add(ctx, {
      name: '周宇',
      birthday: { calendar: 'lunar', year: 2017, month: 6, day: 15, leapMonth: true },
    })
    expect(person.birthday).toMatchObject({
      calendar: 'lunar',
      leapMonth: true,
      lunarDate: '农历闰六月十五',
      bornSolar: '2017-08-06',
      zodiac: '鸡',
    })
  })

  it('refuses a leap month on a solar birthday with 400', async () => {
    const ctx = await setup()
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/people',
      headers: web(ctx),
      payload: {
        name: '谁',
        birthday: { calendar: 'solar', year: 1996, month: 4, day: 15, leapMonth: true },
      },
    })
    expect(res.statusCode).toBe(400)
    // Refused because the solar calendar has no leap month, not because the key is unknown.
    expect(res.json().detail).toContain('leap month')
  })

  it('refuses a solar day that does not exist, and allows a lunar 30th', async () => {
    const ctx = await setup()
    const bad = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/people',
      headers: web(ctx),
      payload: { name: '谁', birthday: { calendar: 'solar', year: 1996, month: 2, day: 30 } },
    })
    expect(bad.statusCode).toBe(400)
    expect(bad.json().detail).toContain('does not exist')
    const ok = await add(ctx, {
      name: '外婆',
      birthday: { calendar: 'lunar', year: 1944, month: 12, day: 30 },
    })
    expect(ok.birthday?.bornSolar).toBe('1945-02-12')
  })

  it('clears a birthday without touching the other fields', async () => {
    const ctx = await setup()
    const person = await add(ctx, {
      name: '王颖',
      circle: 'friend',
      hometown: '杭州',
      city: '上海',
      title: '后端工程师',
      gender: 'female',
      birthday: { calendar: 'solar', year: 1993, month: 10, day: 10 },
    })
    const cleared = await patch(ctx, person.id, { birthday: null })
    expect(cleared.statusCode, cleared.body).toBe(200)
    const body = cleared.json() as PersonResponse
    expect(body.birthday).toBeNull()
    expect(body.circle).toBe('friend')
    expect(body.hometown).toBe('杭州')
    expect(body.city).toBe('上海')
    expect(body.title).toBe('后端工程师')
    expect(body.gender).toBe('female')
  })

  /** The constraint holds where the data lives; the contract binds only the API. */
  it('lets the database refuse half a birthday', async () => {
    const ctx = await setup()
    const person = await add(ctx, { name: '半个' })
    await expect(
      ctx.db.execute(sql`update people set birthday_month = 4 where id = ${person.id}`),
    ).rejects.toThrow()
  })

  /**
   * Create and update share one shape, so a defaulted `remindLead` would silently reset a lead
   * the person chose whenever only the date is patched.
   */
  it('keeps the lead when only the date changes', async () => {
    const ctx = await setup()
    const person = await add(ctx, {
      name: '李雷',
      birthday: { calendar: 'solar', year: 1991, month: 10, day: 17, remindLead: 1 },
    })
    expect(person.birthday?.remindLead).toBe(1)

    const moved = await patch(ctx, person.id, {
      birthday: { calendar: 'solar', year: 1991, month: 10, day: 18 },
    })
    expect(moved.statusCode, moved.body).toBe(200)
    expect((moved.json() as PersonResponse).birthday).toMatchObject({ day: 18, remindLead: 1 })
  })

  /**
   * Clearing a birthday resets the lead to its default 7, or the next birthday written would
   * inherit a lead nobody chose.
   */
  it('resets the lead when the birthday is cleared', async () => {
    const ctx = await setup()
    const person = await add(ctx, {
      name: '韩梅梅',
      birthday: { calendar: 'solar', year: 1991, month: 10, day: 17, remindLead: 0 },
    })
    expect((await patch(ctx, person.id, { birthday: null })).statusCode).toBe(200)

    const again = await patch(ctx, person.id, {
      birthday: { calendar: 'solar', year: 1991, month: 10, day: 17 },
    })
    expect(again.statusCode, again.body).toBe(200)
    expect((again.json() as PersonResponse).birthday?.remindLead).toBe(7)
  })

  /**
   * Separate month and day ranges would allow April 31 in the database; the day-in-month check
   * keeps it out even for a write that skips the API.
   */
  it('lets the database refuse a day its month does not have', async () => {
    const ctx = await setup()
    const person = await add(ctx, { name: '四月三十一' })
    await expect(
      ctx.db.execute(
        sql`update people set birthday_calendar = 'solar', birthday_month = 4, birthday_day = 31
            where id = ${person.id}`,
      ),
    ).rejects.toThrow()
    // ...and the days that DO exist still go in, by the same route.
    await ctx.db.execute(
      sql`update people set birthday_calendar = 'solar', birthday_month = 4, birthday_day = 30
          where id = ${person.id}`,
    )
    // A lunar month has at most 30 days, and the 30th of a lunar month is a real birthday.
    await ctx.db.execute(
      sql`update people set birthday_calendar = 'lunar', birthday_month = 6, birthday_day = 30
          where id = ${person.id}`,
    )
  })

  it('accepts only 0, 1, 3 or 7 as the lead', async () => {
    const ctx = await setup()
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/people',
      headers: web(ctx),
      payload: {
        name: '谁',
        birthday: { calendar: 'solar', year: 1990, month: 1, day: 1, remindLead: 5 },
      },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().detail).toContain('remindLead')
  })
})
