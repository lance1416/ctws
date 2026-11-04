import type { CircleId, PersonId } from '@ctws/contracts'
import { afterEach, describe, expect, it } from 'vitest'
import { createMeeting, createPerson } from '../../helpers/builders'
import { setupWith, type Harness } from '../../helpers/harness'

/**
 * How often to be in touch: set on a person or on their circles, due a rhythm after the last
 * message or meeting together, and in Today's "Get in touch" from that day until the next.
 */

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

/** An account whose clock the test moves; days are UTC. */
async function setup(start = '2026-10-02') {
  const clock = { now: new Date(`${start}T09:00:00Z`) }
  // A session lasts longer than the months these tests move the clock by.
  const ctx = await setupWith(cleanups, 'me@example.com', {
    clock: () => clock.now,
    env: { sessionTtlDays: 400 },
  })
  const onDay = (day: string) => (clock.now = new Date(`${day}T09:00:00Z`))
  return { ctx, onDay }
}

const call = (
  ctx: Harness,
  method: 'GET' | 'PUT' | 'PATCH' | 'POST',
  url: string,
  payload?: object,
) =>
  ctx.app.inject({
    method,
    url: `/api/v1${url}`,
    headers: ctx.authed,
    ...(payload ? { payload } : {}),
  })

/** Circles by name, made as a list. */
async function circles(ctx: Harness, ...names: string[]): Promise<Record<string, CircleId>> {
  const res = await call(ctx, 'PUT', '/people/circles', {
    circles: names.map((name) => ({ name })),
  })
  return Object.fromEntries(
    res.json().circles.map((c: { id: string; name: string }) => [c.name, c.id]),
  )
}

const setCircle = (ctx: Harness, id: string, touchEvery: string | null) =>
  call(ctx, 'PATCH', `/people/circles/${id}`, { touchEvery })

const message = (ctx: Harness, person: PersonId, occurredAt: string, direction = 'sent') =>
  call(ctx, 'POST', '/communication', {
    direction,
    channel: 'message',
    occurredAt,
    parties: [{ type: 'person', id: person }],
  })

const due = async (ctx: Harness) => {
  const res = await call(ctx, 'GET', '/people?view=get-in-touch')
  expect(res.statusCode, res.body).toBe(200)
  return res.json().people as { personId: string }[]
}

const touch = async (ctx: Harness, id: string) =>
  (await call(ctx, 'GET', `/people/${id}/touch`)).json()

describe('a circle every month', () => {
  it('brings Lena up a month after her last message, and takes her away once messaged', async () => {
    const { ctx, onDay } = await setup()
    const { Friends } = await circles(ctx, 'Friends')
    await setCircle(ctx, Friends!, '1m')
    const lena = await createPerson(ctx, { name: 'Lena Fischer', circleIds: [Friends!] })
    expect((await message(ctx, lena.id, '2026-10-02T08:00:00Z')).statusCode).toBe(201)

    onDay('2026-11-01')
    expect(await due(ctx)).toEqual([])
    onDay('2026-11-02')
    expect(await due(ctx)).toMatchObject([
      { personId: lena.id, name: 'Lena Fischer', lastInTouch: '2026-10-02', dueOn: '2026-11-02' },
    ])
    expect(await touch(ctx, lena.id)).toMatchObject({
      every: '1m',
      from: { kind: 'circle', circleId: Friends, name: 'Friends' },
      lastInTouch: '2026-10-02',
      dueOn: '2026-11-02',
    })

    await message(ctx, lena.id, '2026-11-02T09:00:00Z')
    expect(await due(ctx)).toEqual([])
  })

  it('is silenced by her own Off, whatever the circle says', async () => {
    const { ctx, onDay } = await setup()
    const { Friends } = await circles(ctx, 'Friends')
    await setCircle(ctx, Friends!, '1w')
    const lena = await createPerson(ctx, { name: 'Lena Fischer', circleIds: [Friends!] })
    await call(ctx, 'PATCH', `/people/${lena.id}`, { touchEvery: 'off' })
    onDay('2026-12-01')
    expect(await due(ctx)).toEqual([])
    expect(await touch(ctx, lena.id)).toMatchObject({ every: null, from: null, dueOn: null })
  })

  it('gives way to the most frequent of her circles, named on her page', async () => {
    const { ctx } = await setup()
    const { Family, Friends } = await circles(ctx, 'Friends', 'Family')
    await setCircle(ctx, Friends!, '1m')
    await setCircle(ctx, Family!, '1w')
    const lena = await createPerson(ctx, { name: 'Lena Fischer', circleIds: [Friends!, Family!] })
    expect(await touch(ctx, lena.id)).toMatchObject({
      every: '1w',
      from: { kind: 'circle', name: 'Family' },
    })
  })

  it('gives way to her own rhythm when she has one', async () => {
    const { ctx } = await setup()
    const { Friends } = await circles(ctx, 'Friends')
    await setCircle(ctx, Friends!, '1w')
    const lena = await createPerson(ctx, { name: 'Lena Fischer', circleIds: [Friends!] })
    await call(ctx, 'PATCH', `/people/${lena.id}`, { touchEvery: '3m' })
    expect(await touch(ctx, lena.id)).toMatchObject({ every: '3m', from: { kind: 'person' } })
  })
})

describe('the last time in touch', () => {
  it('is the latest of a message either way and a meeting held together', async () => {
    const { ctx, onDay } = await setup('2026-10-25')
    const lena = await createPerson(ctx, { name: 'Lena Fischer', touchEvery: '1m' })
    await message(ctx, lena.id, '2026-10-02T08:00:00Z', 'received')
    await createMeeting(ctx, {
      title: 'Coffee',
      startsLocal: '2026-10-20T10:00',
      attendeeIds: [lena.id],
    })
    onDay('2026-11-04')
    expect(await touch(ctx, lena.id)).toMatchObject({
      lastInTouch: '2026-10-20',
      dueOn: '2026-11-20',
    })
  })

  it('counts from the day the rhythm was set for someone never in touch', async () => {
    const { ctx, onDay } = await setup('2026-10-02')
    const priya = await createPerson(ctx, { name: 'Priya Shah', touchEvery: '1w' })
    expect(await touch(ctx, priya.id)).toMatchObject({ lastInTouch: null, dueOn: '2026-10-09' })
    onDay('2026-10-09')
    expect(await due(ctx)).toMatchObject([{ personId: priya.id, lastInTouch: null }])
  })
})

describe('Later', () => {
  it('puts her off until the day chosen, and is over once you are in touch', async () => {
    const { ctx, onDay } = await setup()
    const lena = await createPerson(ctx, { name: 'Lena Fischer', touchEvery: '1m' })
    await message(ctx, lena.id, '2026-10-02T08:00:00Z')
    onDay('2026-11-02')
    const later = await call(ctx, 'POST', `/people/${lena.id}/touch-later`, { until: '2026-11-09' })
    expect(later.statusCode, later.body).toBe(200)
    expect(later.json()).toMatchObject({ dueOn: '2026-11-09' })
    expect(await due(ctx)).toEqual([])
    onDay('2026-11-09')
    expect(await due(ctx)).toHaveLength(1)

    // In touch again: the rhythm runs from then, and the old Later is gone.
    await message(ctx, lena.id, '2026-11-09T08:00:00Z')
    expect(await touch(ctx, lena.id)).toMatchObject({ dueOn: '2026-12-09' })
  })
})

describe('without a rhythm', () => {
  it('nobody comes up, however long it has been', async () => {
    const { ctx, onDay } = await setup()
    const lena = await createPerson(ctx, { name: 'Lena Fischer' })
    await message(ctx, lena.id, '2026-01-02T08:00:00Z')
    onDay('2026-12-01')
    expect(await due(ctx)).toEqual([])
    expect(await touch(ctx, lena.id)).toEqual({
      every: null,
      from: null,
      lastInTouch: '2026-01-02',
      dueOn: null,
    })
  })
})
