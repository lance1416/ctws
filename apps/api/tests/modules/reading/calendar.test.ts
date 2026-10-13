import type { CalendarEntry } from '@ctws/contracts'
import { afterEach, describe, expect, it } from 'vitest'
import { createProject, type Harness, setupWith, web } from '../../helpers/harness'

const cleanups: (() => Promise<void>)[] = []

const setup = () => setupWith(cleanups)
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

async function entries(ctx: Harness, from: string, to: string) {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/api/v1/reading/calendar?from=${from}&to=${to}`,
    headers: ctx.authed,
  })
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as { entries: CalendarEntry[] }).entries
}

async function add(ctx: Harness, payload: Record<string, unknown>): Promise<string> {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/reading',
    headers: web(ctx),
    payload,
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { id: string }).id
}

const plan = (ctx: Harness, id: string, planOn: string | null) =>
  ctx.app.inject({
    method: 'PATCH',
    url: `/api/v1/reading/${id}`,
    headers: web(ctx),
    payload: { planOn },
  })

describe('the reading calendar', () => {
  it('answers for a finish-by date', async () => {
    const ctx = await setup()
    const id = await add(ctx, { kind: 'book', title: '设计心理学' })
    expect((await plan(ctx, id, '2026-10-07')).statusCode).toBe(200)

    const got = await entries(ctx, '2026-10-01', '2026-10-31')
    expect(got).toHaveLength(1)
    expect(got[0]).toMatchObject({ day: '2026-10-07', title: '设计心理学', kind: 'to read' })
  })

  it('shows an untitled link by its url rather than leaving a blank square', async () => {
    const ctx = await setup()
    const id = await add(ctx, { kind: 'link', url: 'https://linear.app/now/a' })
    await plan(ctx, id, '2026-10-07')
    expect((await entries(ctx, '2026-10-01', '2026-10-31'))[0]?.title).toBe(
      'https://linear.app/now/a',
    )
  })

  it('drops the plan when it is cleared, and leaves out what is read', async () => {
    const ctx = await setup()
    const read = await add(ctx, { kind: 'book', title: '读完了的' })
    await plan(ctx, read, '2026-10-07')
    await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/reading/${read}`,
      headers: web(ctx),
      payload: { status: 'done' },
    })
    const cleared = await add(ctx, { kind: 'book', title: '取消计划的' })
    await plan(ctx, cleared, '2026-10-07')
    expect((await plan(ctx, cleared, null)).statusCode).toBe(200)

    expect(await entries(ctx, '2026-10-01', '2026-10-31')).toEqual([])
  })

  it('names the project, and none once the project is deleted', async () => {
    const ctx = await setup()
    const pid = await createProject(ctx, 'CTWS')
    const id = await add(ctx, { kind: 'book', title: '设计心理学', projectId: pid })
    await plan(ctx, id, '2026-10-07')
    expect((await entries(ctx, '2026-10-01', '2026-10-31'))[0]?.projectName).toBe('CTWS')

    const del = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/${pid}`,
      headers: web(ctx),
    })
    expect(del.statusCode).toBe(204)
    expect((await entries(ctx, '2026-10-01', '2026-10-31'))[0]).toMatchObject({
      projectId: null,
      projectName: null,
    })
  })

  it('refuses a window that is not a pair of calendar days', async () => {
    const ctx = await setup()
    const bad = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/reading/calendar?from=2026-10-01',
      headers: ctx.authed,
    })
    expect(bad.statusCode).toBe(400)
  })
})
