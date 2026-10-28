import type { ReadingItemResponse } from '@ctws/contracts'
import { afterEach, describe, expect, it } from 'vitest'
import { setupWith, type Harness } from '../../helpers/harness'

/**
 * SINCE WHEN (FR-072, FR-073): an item says when it took the status it has, from its own log; one
 * never changed has had it since it was added.
 */
let now = new Date('2026-09-30T09:00:00.000Z')

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!()
})

const setup = () => setupWith(cleanups, undefined, { clock: () => now, timezone: 'Europe/London' })

async function send(
  ctx: Harness,
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  payload?: object,
) {
  const res = await ctx.app.inject({
    method,
    url: `/api/v1${path}`,
    headers: ctx.authed,
    ...(payload ? { payload } : {}),
  })
  expect(res.statusCode, res.body).toBeLessThan(300)
  return res.json() as ReadingItemResponse
}

describe('statusSince', () => {
  it('is when it was added, then when it was started, then finished', async () => {
    const ctx = await setup()
    const item = await send(ctx, 'POST', '/reading', { kind: 'book', title: 'DDIA' })
    expect(item.statusSince).toBe('2026-09-30T09:00:00.000Z')

    now = new Date('2026-10-02T08:00:00.000Z')
    expect(
      (await send(ctx, 'PATCH', `/reading/${item.id}`, { status: 'reading' })).statusSince,
    ).toBe('2026-10-02T08:00:00.000Z')
    // Another field changed later leaves the status's day as it was.
    now = new Date('2026-10-05T08:00:00.000Z')
    expect(
      (await send(ctx, 'PATCH', `/reading/${item.id}`, { author: 'Kleppmann' })).statusSince,
    ).toBe('2026-10-02T08:00:00.000Z')
    now = new Date('2026-10-20T08:00:00.000Z')
    await send(ctx, 'PATCH', `/reading/${item.id}`, { status: 'done' })
    expect((await send(ctx, 'GET', `/reading/${item.id}`)).statusSince).toBe(
      '2026-10-20T08:00:00.000Z',
    )
  })
})
