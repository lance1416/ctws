import type { PersonResponse } from '@ctws/contracts'
import { afterEach, describe, expect, it } from 'vitest'
import { createPerson } from '../../helpers/builders'
import { appWithUser, type Harness } from '../../helpers/harness'

/**
 * A PERSON AFTER THE REDESIGN (FR-049): a name in three parts shown in its script's order and
 * filed by the family name's letter; other names that search finds; circles of your own; a time
 * zone from the city they live in, unless set by hand; birthdays counted on their clock.
 */
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

async function setup(opts: Parameters<typeof appWithUser>[1] = {}) {
  const ctx = await appWithUser('p@example.com', opts)
  cleanups.push(ctx.stop)
  return ctx
}

const post = (ctx: Harness, body: object) =>
  ctx.app.inject({ method: 'POST', url: '/api/v1/people', headers: ctx.authed, payload: body })
const patch = (ctx: Harness, id: string, body: object) =>
  ctx.app.inject({
    method: 'PATCH',
    url: `/api/v1/people/${id}`,
    headers: ctx.authed,
    payload: body,
  })

describe('a name in three parts', () => {
  it('is shown in the order its script expects and filed by the family name', async () => {
    const ctx = await setup()
    const wen = (await post(ctx, { givenName: '雯', familyName: '李' })).json() as PersonResponse
    expect([wen.name, wen.sortKey]).toEqual(['李雯', 'L'])
    const mary = (
      await post(ctx, { givenName: 'Mary', middleName: 'Jane', familyName: 'Watson' })
    ).json() as PersonResponse
    expect([mary.name, mary.sortKey]).toEqual(['Mary Jane Watson', 'W'])
    const chen = (await post(ctx, { givenName: '思远', familyName: '陈' })).json() as PersonResponse
    expect(chen.sortKey).toBe('C')
  })

  it('is split from one string the way the migration splits it', async () => {
    const ctx = await setup()
    const p = (await post(ctx, { name: 'Li, Wendy' })).json() as PersonResponse
    expect([p.givenName, p.familyName, p.name, p.sortKey]).toEqual(['Wendy', 'Li', 'Wendy Li', 'L'])
  })

  it('lists people by letter, then by name, with Chinese names among the Latin ones', async () => {
    const ctx = await setup()
    for (const body of [
      { givenName: '雯', familyName: '李' },
      { givenName: 'Mira', familyName: 'Chen' },
      { givenName: '思远', familyName: '陈' },
      { givenName: 'Cher' },
    ]) {
      expect((await post(ctx, body)).statusCode).toBe(201)
    }
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/people', headers: ctx.authed })
    expect(
      (res.json() as { people: PersonResponse[] }).people.map((p) => `${p.sortKey} ${p.name}`),
    ).toEqual(['C Cher', 'C Mira Chen', 'C 陈思远', 'L 李雯'])
  })

  it('needs a name of some kind', async () => {
    const ctx = await setup()
    expect((await post(ctx, { note: 'nobody' })).statusCode).toBe(400)
  })
})

describe('other names', () => {
  it('are kept with their labels and found by search', async () => {
    const ctx = await setup()
    const p = (
      await post(ctx, {
        givenName: '雯',
        familyName: '李',
        aliases: [{ name: 'Wendy Li', label: 'English name' }],
      })
    ).json() as PersonResponse
    expect(p.aliases).toEqual([{ name: 'Wendy Li', label: 'English name' }])
    const found = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/people?q=Wendy',
      headers: ctx.authed,
    })
    expect((found.json() as { people: PersonResponse[] }).people.map((x) => x.id)).toEqual([p.id])
  })
})

describe('circles', () => {
  it('are a list of your own; a person may be in several; deleting one keeps its people', async () => {
    const ctx = await setup()
    const put = (circles: object[]) =>
      ctx.app.inject({
        method: 'PUT',
        url: '/api/v1/people/circles',
        headers: ctx.authed,
        payload: { circles },
      })
    const made = (
      await put([{ name: 'Family' }, { name: 'Friends' }, { name: 'Climbing' }])
    ).json() as {
      circles: { id: string; name: string; count: number }[]
    }
    expect(made.circles.map((c) => c.name)).toEqual(['Family', 'Friends', 'Climbing'])
    const [family, friends, climbing] = made.circles.map((c) => c.id)

    const tom = (
      await post(ctx, { givenName: 'Tom', familyName: 'Okafor', circleIds: [friends, climbing] })
    ).json() as PersonResponse
    expect(tom.circleIds).toEqual([friends, climbing])

    // Rename and reorder, keeping ids; drop Climbing: Tom stays, just out of it.
    const again = (
      await put([
        { id: friends, name: 'Friends' },
        { id: family, name: 'Relatives' },
      ])
    ).json() as {
      circles: { id: string; name: string; count: number }[]
    }
    expect(again.circles).toEqual([
      { id: friends, name: 'Friends', count: 1 },
      { id: family, name: 'Relatives', count: 0 },
    ])
    const read = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/people/${tom.id}`,
      headers: ctx.authed,
    })
    expect((read.json() as PersonResponse).circleIds).toEqual([friends])

    // Two circles cannot share a name; a circle from nowhere is not found.
    expect((await put([{ name: 'Work' }, { name: 'Work' }])).statusCode).toBe(400)
    expect((await post(ctx, { givenName: 'X', circleIds: [climbing] })).statusCode).toBe(404)
  })
})

describe('time zone', () => {
  it('comes from the city they live in, follows a change of city, and yields to a hand-set zone', async () => {
    const ctx = await setup()
    const p = (
      await post(ctx, { givenName: '磊', familyName: '王', city: 'Shanghai, China' })
    ).json() as PersonResponse
    expect([p.timeZone, p.timeZoneSource]).toEqual(['Asia/Shanghai', 'city'])

    const moved = (
      await patch(ctx, p.id, { city: 'Toronto, Ontario, Canada' })
    ).json() as PersonResponse
    expect([moved.timeZone, moved.timeZoneSource]).toEqual(['America/Toronto', 'city'])

    const byHand = (await patch(ctx, p.id, { timeZone: 'Europe/London' })).json() as PersonResponse
    expect([byHand.timeZone, byHand.timeZoneSource]).toEqual(['Europe/London', 'manual'])
    const stays = (await patch(ctx, p.id, { city: 'Shanghai, China' })).json() as PersonResponse
    expect(stays.timeZone).toBe('Europe/London')

    // Back to the city's.
    const released = (await patch(ctx, p.id, { timeZone: null })).json() as PersonResponse
    expect([released.timeZone, released.timeZoneSource]).toEqual(['Asia/Shanghai', 'city'])
  })

  it('is taken by key when the city has namesakes', async () => {
    const ctx = await setup()
    const p = (
      await post(ctx, {
        givenName: 'Ann',
        city: 'Cambridge, England, United Kingdom',
        cityKey: 'Cambridge|England|United Kingdom',
      })
    ).json() as PersonResponse
    expect(p.timeZone).toBe('Europe/London')
  })
})

describe('a birthday is counted on the person’s own clock', () => {
  it('has begun in Shanghai while it is still yesterday in London', async () => {
    // 2026-10-18 17:30 UTC: the 18th in London (BST), already the 19th in Shanghai (UTC+8).
    const ctx = await setup({ clock: () => new Date('2026-10-18T17:30:00Z') })
    await ctx.db.execute(sql`update users set timezone = 'Europe/London'`)
    await createPerson(ctx, {
      givenName: '磊',
      familyName: '王',
      city: 'Shanghai, China',
      birthday: { calendar: 'solar', month: 10, day: 19 },
    } as never)
    await createPerson(ctx, {
      givenName: 'Local',
      birthday: { calendar: 'solar', month: 10, day: 19 },
    } as never)
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/people?view=birthdays',
      headers: ctx.authed,
    })
    expect(res.statusCode, res.body).toBe(200)
    const view = res.json() as { today: string; coming: { name: string; inDays: number }[] }
    expect(view.today).toBe('2026-10-18')
    expect(view.coming.map((r) => [r.name, r.inDays])).toEqual([
      ['王磊', 0],
      ['Local', 1],
    ])
  })
})

import { sql } from 'drizzle-orm'
